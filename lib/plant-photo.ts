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
 * Preprocesado para la IA (INTEGRACION_IA.MD:42-46): 1024 px en el lado largo y JPEG
 * calidad 80. Distinto del de la foto de perfil de la planta: la IA no recorta a
 * cuadrado (necesita ver la hoja entera) y sube la calidad un punto porque el modelo
 * mira bordes de manchas.
 */
const AI_LONG_EDGE = 1024;
const AI_JPEG_QUALITY = 0.8;

/**
 * Redimensiona al lado largo y devuelve la imagen en base64 para mandarla en el cuerpo
 * de la invocación. La Edge Function la decodifica, hashea, sube y firma (§2): el hash y
 * el dedupe viven del lado del servidor, así que aquí no se sube nada.
 *
 * `width`/`height` vienen del asset del picker para restringir el lado correcto sin un
 * decode extra. Si faltan, se acota el ancho (peor caso: una vertical queda un poco más
 * grande de 1024 de alto, sin consecuencia real).
 */
export async function prepareAiImage(params: {
  localUri: string;
  width?: number;
  height?: number;
}): Promise<string> {
  const { localUri, width, height } = params;
  const resize =
    width && height
      ? width >= height
        ? { width: AI_LONG_EDGE }
        : { height: AI_LONG_EDGE }
      : { width: AI_LONG_EDGE };

  const processed = await manipulateAsync(localUri, [{ resize }], {
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
