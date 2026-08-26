import type { AuthError } from '@supabase/supabase-js';

/** Código que la pantalla necesita distinguir para ofrecer una salida, no solo texto. */
export type AuthErrorKind = 'invalid_credentials' | 'email_exists' | 'rate_limited' | 'generic';

export type AuthErrorInfo = {
  kind: AuthErrorKind;
  message: string;
};

/**
 * Traduce los errores de Supabase, que llegan en inglés y con jerga.
 *
 * **Tono neutro, no la voz de Flory.** Auth es una pantalla transaccional: aquí el
 * usuario está tratando con una empresa, no con su planta (FlorySpec §14, §57). El
 * personaje aparece recién en el onboarding.
 *
 * Los mensajes no culpan al usuario y no prometen certezas falsas.
 */
export function authError(error: AuthError | null): AuthErrorInfo | undefined {
  if (!error) return undefined;

  const code = error.code ?? '';

  if (code === 'invalid_credentials' || error.message.includes('Invalid login credentials')) {
    return {
      kind: 'invalid_credentials',
      // Nunca decir cuál de los dos falló. Distinguirlos permite averiguar qué
      // correos tienen cuenta probando uno por uno (FlorySpec §99).
      message: 'Correo o contraseña incorrectos.',
    };
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    return { kind: 'email_exists', message: 'Ya existe una cuenta con este correo.' };
  }
  if (code === 'weak_password') {
    return { kind: 'generic', message: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (code === 'email_not_confirmed') {
    return { kind: 'generic', message: 'Falta confirmar el correo. Revisa tu bandeja de entrada.' };
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return { kind: 'rate_limited', message: 'Demasiados intentos. Espera un minuto y vuelve a probar.' };
  }
  if (code === 'validation_failed') {
    return { kind: 'generic', message: 'Revisa que el correo esté bien escrito.' };
  }

  return { kind: 'generic', message: 'No pudimos completar la operación. Inténtalo de nuevo.' };
}
