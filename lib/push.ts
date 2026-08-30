import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Notificaciones push de Flory (riego / revisar / diagnóstico).
 *
 * El token de Expo se guarda en `profiles.push_token`; el job del servidor
 * (Edge Function `send-notifications`) lee las vistas `*_due_*` y envía por Expo Push.
 * Aquí solo vive el lado cliente: permiso, token, y el ruteo al tocar el aviso.
 */

// Con la app abierta, mostrar igual el aviso (banner + sonido). Sin esto, una push
// recibida en primer plano no se ve y parece que no llegó.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId;
}

/**
 * Obtiene el Expo push token y lo guarda en `profiles`. Best-effort: un fallo aquí nunca
 * debe romper el arranque ni el login.
 *
 * `prompt: false` (default) es silencioso: solo registra si el permiso YA está concedido,
 * sin abrir el diálogo del sistema — así el login/onboarding no dispara la petición en un
 * mal momento. `prompt: true` (desde la pantalla de Avisos, cuando el usuario activa el
 * switch) sí pide el permiso.
 *
 * @returns true si quedó un token válido guardado.
 */
export async function registerForPushNotifications(
  userId: string,
  options: { prompt?: boolean } = {},
): Promise<boolean> {
  try {
    // El token real de push no existe en simulador; solo en dispositivo físico.
    if (!Device.isDevice) return false;

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      if (!options.prompt || !current.canAskAgain) return false;
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return false;

    const projectId = getProjectId();
    if (!projectId) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token, timezone })
      .eq('id', userId);
    if (error) throw error;

    return true;
  } catch (error) {
    console.warn('Push registration failed.', error);
    return false;
  }
}

/**
 * Limpia el token al cerrar sesión: un dispositivo compartido no debe seguir recibiendo
 * los avisos de la cuenta anterior. Se llama ANTES de `signOut` (después no habría auth).
 */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
  } catch (error) {
    console.warn('Clearing push token failed.', error);
  }
}

/** ¿El SO tiene los avisos concedidos? Para reflejarlo en la pantalla de ajustes. */
export async function hasNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted;
}

/** Abre la ficha de la planta que disparó la notificación (`data.plantId`). */
function openFromResponse(response: Notifications.NotificationResponse | null) {
  const plantId = response?.notification.request.content.data?.plantId;
  if (typeof plantId === 'string' && plantId.length > 0) {
    router.push({ pathname: '/plant/[id]', params: { id: plantId } });
  }
}

/**
 * Al tocar una notificación, navega a la ficha de la planta.
 *
 * - App abierta/en background: el listener navega al instante (el árbol ya está montado).
 * - Arranque en frío desde la push: `getLastNotificationResponseAsync` da el tap que abrió
 *   la app, pero hay que ESPERAR a que la navegación esté lista (`useRootNavigationState`).
 *   Sin eso, el `router.push` corre antes de montar el Stack y el deep link se pierde.
 */
export function useNotificationRouting(): void {
  const navReady = useRootNavigationState()?.key != null;

  // Tap con la app ya corriendo.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => subscription.remove();
  }, []);

  // Arranque en frío: procesar el tap inicial recién cuando la navegación está montada.
  useEffect(() => {
    if (!navReady) return;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled) openFromResponse(response);
    });
    return () => {
      cancelled = true;
    };
  }, [navReady]);
}
