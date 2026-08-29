import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AppleAuthStage = 'native' | 'supabase';

class AppleAuthError extends Error {
  constructor(
    readonly stage: AppleAuthStage,
    options?: ErrorOptions,
  ) {
    super(`apple_${stage}_failed`, options);
    this.name = 'AppleAuthError';
  }
}

function errorField(error: unknown, field: 'code' | 'status') {
  if (typeof error !== 'object' || error === null || !(field in error)) return undefined;
  return String((error as Record<string, unknown>)[field]);
}

function reportAppleAuthError(stage: AppleAuthStage, error: unknown) {
  // No registrar nunca el token ni el nonce. Estos campos bastan para distinguir
  // AuthorizationServices de un rechazo de GoTrue en los logs del dispositivo.
  console.warn('Apple sign-in failed.', {
    stage,
    code: errorField(error, 'code'),
    status: errorField(error, 'status'),
  });
}

async function createNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  return { raw, hashed };
}

/**
 * Apple solo entrega el nombre en el **primer** login de cada usuario; después viene null.
 * Si llega, lo guardamos en Auth y en `profiles`. Es best-effort: un fallo aquí no
 * debe tumbar un login que ya tuvo éxito.
 */
async function persistAppleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  const appleName = [fullName?.givenName, fullName?.middleName, fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return;

  const savedName =
    typeof data.user.user_metadata?.display_name === 'string'
      ? data.user.user_metadata.display_name.trim()
      : '';
  const name = savedName || appleName;
  if (!name) return;

  // No pisar un nombre que el usuario ya haya elegido.
  if (!savedName) {
    await supabase.auth.updateUser({ data: { display_name: name } });
  }

  await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', data.user.id)
    .is('display_name', null);
}

/** Abre la hoja nativa de Apple y entrega su ID token a Supabase. */
export async function signInWithApple(): Promise<'signed-in' | 'cancelled'> {
  // El login con Apple solo se ofrece en iOS (ver components/ui/social-buttons.tsx).
  if (Platform.OS !== 'ios') {
    throw new Error('apple_ios_only');
  }

  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('apple_unavailable');
  }

  const { raw: nonce, hashed: hashedNonce } = await createNonce();

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      String(error.code) === 'ERR_REQUEST_CANCELED'
    ) {
      return 'cancelled';
    }
    reportAppleAuthError('native', error);
    throw new AppleAuthError('native', { cause: error });
  }

  if (!credential.identityToken) throw new Error('invalid_apple_response');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  });
  if (error) {
    reportAppleAuthError('supabase', error);
    throw new AppleAuthError('supabase', { cause: error });
  }

  await persistAppleName(credential.fullName);

  return 'signed-in';
}

export function appleAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : '';

  if (code === 'apple_unavailable') {
    return 'Tu dispositivo no tiene disponible el inicio de sesión con Apple.';
  }

  if (error instanceof AppleAuthError && error.stage === 'supabase') {
    return 'Apple confirmó tu identidad, pero no pudimos completar el acceso. Inténtalo de nuevo.';
  }

  return 'Apple no pudo completar el acceso. Inténtalo de nuevo en un momento.';
}
