import { Tabs } from 'expo-router';

import { FloryTabBar } from '@/components/navigation/tab-bar';
import { colors } from '@/theme/tokens';

/**
 * Explícito a propósito. Sin esto la pestaña inicial sería la primera declarada abajo, y
 * reordenar una línea cambiaría en silencio dónde abre la app. Con el anchor, un nombre
 * mal escrito revienta al construir el árbol de rutas en vez de pasar desapercibido.
 */
export const unstable_settings = {
  anchor: 'index',
};

/**
 * `tabBar` reemplaza el bar por completo. Metro resuelve `FloryTabBar` a
 * `tab-bar.ios.tsx` o `tab-bar.android.tsx` según la plataforma, así que el árbol de
 * rutas —y por tanto los typedRoutes y los deep links— es idéntico en las dos: lo único
 * que cambia es el chrome.
 *
 * El orden visual lo fija `TAB_ORDER` en tabs.config.ts, no el orden de estas líneas.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloryTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bgPage },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="plantas" options={{ title: 'Plantas' }} />
      <Tabs.Screen name="actividad" options={{ title: 'Avisos' }} />
      <Tabs.Screen name="flory" options={{ title: 'Flory' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
