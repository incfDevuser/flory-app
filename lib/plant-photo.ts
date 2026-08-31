import { useQuery } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

/**
 * Fotos de planta.
 *
 * El bucket `plant-photos` es privado (tables.sql:977): no hay URL pública, así que
 * `plants.photo_url` guarda la **ruta** dentro del bucket y para mostrarla se firma una
 * URL temporal. La convención de ruta es `{user_id}/{plant_id}/{uuid}.jpg`, que es lo
 * que exigen las políticas de storage — la primera carpeta tiene que ser el `auth.uid()`
 * del dueño (tables.sql:980-990).
 */

export const PLANT_PHOTO_BUCKET = 'plant-photos';

/** Lado máximo de la imagen subida. La cámara entrega mucho más de lo que la UI usa. */
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.7;

/**
 * Preprocesado para la IA (INTEGRACION_IA.MD:42-46): 1536 px en el lado largo y JPEG
 * calidad 85. Distinto del de la foto de perfil de la planta: la IA no recorta a
 * cuadrado (necesita ver la hoja entera) y sube la calidad porque el modelo mira bordes
 * de manchas.
 *
 * Se subió de 1024/q80 a 1536/q85 para no perder plagas pequeñas: un insecto de pocos
 * píxeles (cochinilla, arañita, un punto negro) se disuelve al bajar a 1024 y comprimir,
 * antes de que el modelo lo vea. 1536 es el punto de equilibrio con el tiling `high` de
 * OpenAI; más allá el detalle extra ya no cambia el diagnóstico y solo sube el costo.
 */
const AI_LONG_EDGE = 1536;
const AI_JPEG_QUALITY = 0.85;

/**
 * Redimensiona al lado largo y devuelve la imagen en base64 para mandarla en el cuerpo
 * de la invocación. La Edge Function la decodifica, hashea, sube y firma (§2): el hash y
 * el dedupe viven del lado del servidor, así que aquí no se sube nada.
 *
 * DOS PASADAS por la orientación EXIF. `expo-image-manipulator` no hornea de forma fiable
 * la orientación EXIF al redimensionar (expo/expo #16736, #2512, #8416): una foto de cámara
 * llega con los píxeles en un eje y una etiqueta que dice cómo rotarla, y si no se aplica,
 * el modelo la recibe girada → la lee como ilegible ("No logro verme bien"), sobre todo en
 * primeros planos. La galería no falla porque iOS entrega el asset ya orientado.
 *
 * Pasada 1: re-encodear sin acciones hornea la orientación y devuelve las dimensiones YA
 * orientadas (fiables). Pasada 2: recién ahí se elige el lado largo con esas dimensiones y
 * se redimensiona. Así no dependemos del `width/height` del picker (que en cámara puede
 * venir pre-orientación, con los ejes cambiados) y nunca rotamos a mano (sin doble rotación).
 * El `width/height` del asset del picker ya no se usa; se conserva el parámetro por compat.
 */
export async function prepareAiImage(params: {
  localUri: string;
  width?: number;
  height?: number;
}): Promise<string> {
  const { localUri } = params;

  // Pasada 1: normaliza la orientación y entrega las dimensiones reales ya orientadas.
  const normalized = await manipulateAsync(localUri, [], { format: SaveFormat.JPEG });

  const resize =
    normalized.width >= normalized.height
      ? { width: AI_LONG_EDGE }
      : { height: AI_LONG_EDGE };

  // Pasada 2: redimensiona sobre la imagen ya derecha.
  const processed = await manipulateAsync(normalized.uri, [{ resize }], {
    compress: AI_JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });

  if (!processed.base64) throw new Error('No se pudo preparar la imagen.');
  return processed.base64;
}

/** La URL firmada dura una hora; se refresca antes de vencer. */
const SIGN_TTL_SECONDS = 60 * 60;
const SIGN_STALE_MS = 50 * 60 * 1000;

/**
 * Sube una imagen local al bucket y devuelve su ruta privada.
 *
 * No hace `upsert` sobre la ruta anterior: cada foto va a una ruta nueva. Así, si la
 * subida falla a medias, la foto vieja sigue intacta y visible; el borrado de la anterior
 * ocurre solo después de que la fila apunta a la nueva.
 */
export async function uploadPlantPhoto(params: {
  userId: string;
  plantId: string;
  localUri: string;
}): Promise<string> {
  const { userId, plantId, localUri } = params;

  // La cámara/galería ya recorta a cuadrado; aquí solo se acota el tamaño y se
  // normaliza a JPEG para que el peso y el tipo sean predecibles.
  const processed = await manipulateAsync(
    localUri,
    [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: SaveFormat.JPEG }
  );

  const bytes = await new File(processed.uri).bytes();
  const path = `${userId}/${plantId}/${randomId()}.jpg`;

  const { error } = await supabase.storage
    .from(PLANT_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg' });

  if (error) throw error;
  return path;
}

/**
 * Borra una foto del bucket. Nunca es la operación crítica: si falla, queda un archivo
 * huérfano pero la planta ya apunta a otra ruta (o a ninguna), así que se traga el error.
 */
export async function deletePlantPhoto(path: string): Promise<void> {
  await supabase.storage.from(PLANT_PHOTO_BUCKET).remove([path]).catch(() => {});
}

/** Firma una URL temporal para una ruta privada. */
async function signPlantPhoto(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PLANT_PHOTO_BUCKET)
    .createSignedUrl(path, SIGN_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Resuelve una ruta privada a una URL mostrable.
 *
 * La clave de caché incluye la ruta: cuando la foto cambia, la ruta cambia y la URL se
 * vuelve a firmar sola. `staleTime` va por debajo del TTL para renovar antes de que
 * venza y la imagen deje de cargar.
 */
export function useSignedPhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ['plant-photo-url', path],
    enabled: path !== null,
    staleTime: SIGN_STALE_MS,
    queryFn: () => signPlantPhoto(path!),
  });
}

/**
 * `crypto.randomUUID` no está garantizado en el runtime de RN, así que se arma un id de
 * colisión improbable con tiempo + azar. Solo tiene que ser único por planta.
 */
function randomId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${random}`;
}
