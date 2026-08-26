import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con service_role. Lleva BYPASSRLS: se salta todas las políticas de
 * security.sql y puede llamar los RPC revocados al cliente (check_diagnosis_quota,
 * find_duplicate_diagnosis, weather_context, increment_diagnosis_usage) y escribir en
 * `diagnoses`. Nunca sale de la Edge Function.
 */
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Extrae el JWT del header Authorization y devuelve el user_id validado.
 *
 * `verify_jwt = true` ya rechaza tokens inválidos en la plataforma, pero necesitamos el
 * id: se lo pedimos a `auth.getUser(token)` usando el propio cliente admin. Devuelve
 * null si no hay token o no resuelve un usuario.
 */
export async function getUserId(
  admin: SupabaseClient,
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
