import 'react-native-url-polyfill/auto';

import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL y/o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.\n' +
      'Copia .env.example a .env.local y pega los valores del proyecto de Supabase.\n' +
      'Después reinicia el dev server: las variables EXPO_PUBLIC_* se inlinean en el bundle ' +
      'en tiempo de build, no se leen en caliente.'
  );
}

/**
 * En el cliente solo vive la publishable key (`sb_publishable_…`). Es pública por diseño
 * —va dentro del bundle— y lo que protege los datos es RLS, no el secreto de la llave.
 *
 * Las dos llaves secretas (`sb_secret_…` y la `service_role` legacy) llevan BYPASSRLS: se
 * saltan todas las políticas de security.sql. Ni ellas ni la de OpenAI tocan nunca este
 * bundle; todo lo privilegiado va por Edge Function. (Flory.md §7)
 *
 * Nota para cuando llegue el diagnóstico por foto: las llaves nuevas no son JWT, así que
 * supabase-js las omite como Bearer al invocar Edge Functions (lib/fetch.ts:31 y
 * SupabaseClient.ts:381). Con sesión iniciada el Authorization lleva el JWT del usuario y
 * `verify_jwt` sigue sirviendo; sin sesión, no. Confirmarlo antes de asumirlo.
 */

/**
 * SecureStore tiene un límite de ~2048 bytes por valor; por encima, Android avisa y el
 * guardado deja de ser fiable. Una sesión de Supabase (access + refresh token + user)
 * lo supera con holgura, así que la sesión se parte en trozos.
 *
 * El valor se pasa por `encodeURIComponent` antes de trocear: así queda ASCII puro y
 * cada carácter ocupa exactamente un byte. Sin eso, un nombre con tilde en
 * `user_metadata` haría que un trozo de N caracteres pesara más de N bytes y se colara
 * por encima del límite.
 *
 * Layout en disco:
 *   `<key>`    → número de trozos, en texto
 *   `<key>.0`  → trozo 0
 *   `<key>.1`  → trozo 1 …
 */
const CHUNK_SIZE = 1800;

export const chunkedSecureStore = {
  async getItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;

    const count = Number.parseInt(head, 10);
    // Un valor que no es un contador es un valor plano de una versión anterior.
    if (!Number.isInteger(count) || String(count) !== head) return head;

    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}.${i}`);
      // Si falta un trozo la sesión está corrupta: mejor forzar re-login que
      // devolver un JSON truncado que reviente al parsear.
      if (chunk === null) return null;
      chunks.push(chunk);
    }

    try {
      return decodeURIComponent(chunks.join(''));
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    const encoded = encodeURIComponent(value);
    const count = Math.max(1, Math.ceil(encoded.length / CHUNK_SIZE));

    // Cuántos trozos había antes, para barrer los que sobren al escribir uno más corto.
    const previousHead = await SecureStore.getItemAsync(key);
    const previousCount = Number.parseInt(previousHead ?? '', 10);

    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }

    if (Number.isInteger(previousCount)) {
      for (let i = count; i < previousCount; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
    }

    await SecureStore.setItemAsync(key, String(count));
  },

  async removeItem(key) {
    const head = await SecureStore.getItemAsync(key);
    const count = Number.parseInt(head ?? '', 10);

    if (Number.isInteger(count)) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
    }

    await SecureStore.deleteItemAsync(key);
  },
} satisfies SupportedStorage;

const isWeb = Platform.OS === 'web';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // En web no hay SecureStore: se deja el default (localStorage) de supabase-js.
    storage: isWeb ? undefined : chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    // En nativo no hay URL que inspeccionar y dejarlo activo rompe el arranque.
    detectSessionInUrl: isWeb,
  },
});

/**
 * supabase-js no sabe que la app se fue a segundo plano. Sin esto, el timer de refresco
 * sigue corriendo en background (donde el SO lo congela) y al volver la sesión puede
 * estar vencida sin que nadie la haya renovado.
 */
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
