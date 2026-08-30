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
 * Extrae el JWT del header Authorization y devuelve el user_id (claim `sub`).
 *
 * Decodifica el payload del token LOCALMENTE, sin llamar a GoTrue. Es seguro: con
 * `verify_jwt = true`, el gateway de Supabase ya validó firma y expiración ANTES de
 * ejecutar la función, así que el `sub` es de fiar. (Antes se usaba `auth.getUser(token)`,
 * pero ese endpoint de GoTrue puede colgarse ~100s y arrastraba a todas las funciones de
 * IA; el resto de la app no lo nota porque PostgREST valida el JWT por su cuenta.)
 *
 * `admin` se conserva en la firma por compatibilidad con los call-sites; ya no se usa.
 * Devuelve null si no hay token, no hay `sub`, o el payload no parsea.
 */
export function getUserId(_admin: SupabaseClient, authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;

  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
