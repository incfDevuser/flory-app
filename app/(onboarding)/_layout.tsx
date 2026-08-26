import { Stack } from 'expo-router';

import { OnboardingDraftProvider } from '@/components/onboarding/onboarding-draft';
import { colors } from '@/theme/tokens';

export const unstable_settings = {
  anchor: 'especie',
};

/**
 * Tres pasos: especie → ubicación → nombre y último riego (roadmap, semana 3).
 * Se puede ir hacia atrás entre pasos, pero no salir del grupo: mientras
 * `profiles.onboarded_at` sea null, el gate del layout raíz no deja pasar a (tabs).
 */
export default function OnboardingLayout() {
  return (
    <OnboardingDraftProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPage },
        }}
      >
        <Stack.Screen name="especie" />
        <Stack.Screen name="ubicacion" />
        <Stack.Screen name="nombre" />
      </Stack>
    </OnboardingDraftProvider>
  );
}
