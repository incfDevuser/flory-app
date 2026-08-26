import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export const unstable_settings = {
  anchor: 'welcome',
};

/**
 * Grupo de cuenta. Tono neutro en todas: Flory todavía no se presentó como personaje
 * (FlorySpec §57). La mascota sí aparece, el habla en primera persona no.
 *
 * **Sin header nativo en ninguna.** El título de cada pantalla va dentro del cuerpo,
 * en display 36px, como pide el spec. Dejarlo en el header lo dejaría a 17px centrado
 * y competiría con el título real. El gesto de volver de iOS se conserva igual, y el
 * botón de volver lo pinta `AuthScaffold`.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPage },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen
        name="verifica-correo"
        // No se vuelve atrás desde aquí: la cuenta ya está creada y el paso siguiente
        // ocurre en el correo, no en la app. El botón para cambiar de correo está
        // dentro de la pantalla.
        options={{ gestureEnabled: false }}
      />
    </Stack>
  );
}
