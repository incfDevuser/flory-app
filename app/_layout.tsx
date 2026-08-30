// Importar por subruta y no desde la raíz del paquete: el index de
// `@expo-google-fonts/*` hace require de TODOS los pesos, y Metro no puede
// tree-shakear un require. Desde la raíz entraban 21 .ttf (~3.6 MB) al bundle en
// vez de las 5 caras que se usan.
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { useNotificationRouting } from '@/lib/push';
import { queryClient } from '@/lib/query';
import { SessionProvider, useSession } from '@/lib/session';
import { colors, fonts } from '@/theme/tokens';

/**
 * v6 renombró `initialRouteName` a `anchor`. Es lo que hace que el back de hardware de
 * Android desde `plant/[id]` vuelva a las tabs en vez de cerrar la app.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

// Ambas devuelven promesas. Sin el catch, un fallo aquí sale como unhandled rejection
// y en producción se traga el arranque sin decir por qué.
SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bgPage).catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, onboardedAt, isLoading } = useSession();

  // Tocar una notificación abre la ficha de esa planta (data.plantId).
  useNotificationRouting();

  // Las claves tienen que coincidir con `fonts` en theme/tokens.ts: es el nombre con
  // el que RN resuelve la familia. `error` cuenta como resuelto a propósito — si una
  // fuente no carga, la app arranca con la del sistema en vez de quedarse en el splash.
  const [fontsLoaded, fontError] = useFonts({
    Baloo2_700Bold,
    Baloo2_800ExtraBold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const fontsReady = fontsLoaded || fontError !== null;

  // El splash NATIVO se mantiene hasta saber a la vez si hay sesión, si el onboarding está
  // hecho, y si cargaron las fuentes. Soltarlo antes dejaría ver un frame de (auth) o de la
  // tipografía del sistema. Ya listo, se monta el splash ANIMADO, que oculta el nativo y se
  // disuelve hacia la app (ver components/animated-splash.tsx).
  const [splashDone, setSplashDone] = useState(false);

  if (isLoading || !fontsReady) return null;

  const signedIn = session !== null;
  const onboarded = onboardedAt !== null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/*
            Todo lo que sigue es hermano de (tabs), no hijo. Por eso se empuja por encima
            del tab bar y lo tapa, en vez de quedar embebido dentro de una pestaña.
          */}
          <Stack.Screen
            name="plant/nueva"
            options={{ presentation: 'modal', title: 'Nueva planta' }}
          />
          <Stack.Screen
            name="plant/[id]/index"
            options={{ title: '', headerBackTitle: 'Mis plantas' }}
          />
          <Stack.Screen
            name="plant/[id]/editar"
            options={{ presentation: 'modal', title: 'Editar' }}
          />
          <Stack.Screen
            name="plant/[id]/diagnosticos"
            options={{ title: 'Mis diagnósticos' }}
          />

          <Stack.Screen
            name="diagnostico/camara"
            options={{
              // Pantalla completa y sin gesto de cierre: no se sale por accidente
              // mientras se encuadra la foto.
              presentation: 'fullScreenModal',
              animation: 'fade',
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="diagnostico/analizando"
            options={{
              // Pantalla de paso. Se sale con `router.replace`, nunca hacia atrás.
              headerShown: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="diagnostico/[id]/index" options={{ title: 'Diagnóstico' }} />
          <Stack.Screen
            name="diagnostico/[id]/seguimiento"
            options={{ title: 'Seguimiento' }}
          />

          <Stack.Screen
            name="ajustes/notificaciones"
            options={{ title: 'Avisos', headerBackTitle: 'Perfil' }}
          />
        </Stack.Protected>
      </Stack>
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </>
  );
}

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bgPage },
  headerTintColor: colors.textHeading,
  // Familia en vez de peso: Baloo2_800ExtraBold ya es la cara extrabold. Pedir
  // además `fontWeight` haría que Android le aplicase un bold sintético encima.
  headerTitleStyle: {
    fontFamily: fonts.display,
    fontSize: 18,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bgPage },
} as const;
