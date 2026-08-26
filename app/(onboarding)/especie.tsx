import { router } from 'expo-router';

import { useOnboardingDraft } from '@/components/onboarding/onboarding-draft';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { SpeciesSearch } from '@/components/plant/species-search';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { useOffline } from '@/lib/use-offline';

export default function EspecieScreen() {
  const { draft, updateDraft } = useOnboardingDraft();
  const { signOut } = useSession();
  const offline = useOffline();

  return (
    <OnboardingScaffold
      step={1}
      title="¿Qué planta tienes?"
      description="Ayúdame a encontrarme en la lista para aprender mis tiempos de riego."
      onBack={() => void signOut()}
      footer={
        <Button
          label="Continuar"
          disabled={!draft.species}
          onPress={() => router.push('/ubicacion')}
        />
      }
    >
      <SpeciesSearch
        selected={draft.species}
        identificationAttemptId={draft.identificationAttemptId}
        onSelect={(species, identificationAttemptId) =>
          updateDraft({ species, identificationAttemptId })
        }
        offline={offline}
        autoFocus
      />
    </OnboardingScaffold>
  );
}
