import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type GoogleConfig = {
  webClientId: string;
  iosClientId: string;
};

function getGoogleConfig(): GoogleConfig {
  const webClientId = Constants.expoConfig?.extra?.googleWebClientId;
  const iosClientId = Constants.expoConfig?.extra?.googleIosClientId;

  if (typeof webClientId !== 'string' || typeof iosClientId !== 'string') {
    throw new Error('missing_google_client_id');
  }

  return { webClientId, iosClientId };
}

async function createNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  return { raw, hashed };
}

/** Abre el selector nativo de Google y entrega su ID token a Supabase. */
export async function signInWithGoogle(): Promise<'signed-in' | 'cancelled'> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('google_native_only');
  }

  const { webClientId, iosClientId } = getGoogleConfig();
  const { raw: nonce, hashed: hashedNonce } = await createNonce();
  const {
    GoogleOneTapSignIn,
    isCancelledResponse,
    isNoSavedCredentialFoundResponse,
    isSuccessResponse,
  } = await import('react-native-nitro-google-signin');

  GoogleOneTapSignIn.configure({
    webClientId,
    iosClientId,
    nonce: hashedNonce,
    offlineAccess: false,
    autoSelectOnSignIn: false,
  });

  await GoogleOneTapSignIn.checkPlayServices();

  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount();
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
  }
  if (isCancelledResponse(response)) return 'cancelled';
  if (!isSuccessResponse(response)) throw new Error('invalid_google_response');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.data.idToken,
    nonce,
  });
  if (error) throw error;

  return 'signed-in';
}

/** Limpia la credencial local para que el próximo acceso pueda elegir otra cuenta. */
export async function signOutFromGoogle(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

  const { GoogleOneTapSignIn } = await import('react-native-nitro-google-signin');
  await GoogleOneTapSignIn.signOut();
}

export function googleAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : '';

  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
    return 'Google Play Services no está disponible o necesita actualizarse.';
  }
  if (code === 'IN_PROGRESS') {
    return 'Ya hay un inicio de sesión con Google en curso.';
  }

  return 'No pudimos iniciar sesión con Google. Inténtalo de nuevo.';
}
