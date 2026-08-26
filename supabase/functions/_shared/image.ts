import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Plomería de imagen compartida (INTEGRACION_IA.MD §2). El cliente ya redimensiona a
 * 1024 px de lado largo y comprime a JPEG q80 antes de mandar los bytes en base64; aquí
 * solo se decodifica, se hashea, se sube al bucket privado y se firma una URL corta.
 */

const BUCKET = 'plant-photos';
/** La URL para el modelo dura lo justo para la llamada. No se reutiliza. */
const SIGN_TTL_SECONDS = 5 * 60;

/** Decodifica base64 a bytes. `atob` está en el runtime de Deno sin imports. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** sha256 en hex, para deduplicar la misma foto del mismo usuario. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Se copia a un ArrayBuffer propio: la firma de `digest` en el lib de Deno 2.9 no
  // acepta el `Uint8Array<ArrayBufferLike>` genérico (podría venir de un SharedArrayBuffer).
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sube los bytes a `{user_id}/{plant_id|tmp}/{uuid}.jpg` con service_role (se salta RLS)
 * y devuelve la ruta privada guardada. `plantSegment` es el id de la planta en diagnose,
 * o 'tmp' en identify (todavía no existe la planta).
 */
export async function uploadImage(
  admin: SupabaseClient,
  userId: string,
  plantSegment: string,
  bytes: Uint8Array
): Promise<string> {
  const uuid = crypto.randomUUID();
  const path = `${userId}/${plantSegment}/${uuid}.jpg`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Firma una URL temporal para que el modelo lea la foto. */
export async function signImage(admin: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error('No se pudo firmar la URL de la imagen.');
  }
  return data.signedUrl;
}

/**
 * Limpia una subida que no terminó asociada a un diagnóstico (validación rechazada,
 * error del modelo o fallo de insert). No propaga el error: un huérfano es menos grave
 * que ocultar la respuesta útil que ya tenemos para el cliente.
 */
export async function deleteImage(admin: SupabaseClient, path: string): Promise<void> {
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}
