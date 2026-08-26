import { router } from 'expo-router';
import { Droplets, Leaf } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceCard, QuestionBlock } from '@/components/onboarding/choices';
import { useOnboardingDraft, type LastWateredChoice } from '@/components/onboarding/onboarding-draft';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { Banner } from '@/components/ui/banner';
import { FloryMascot, MascotHalo } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { DividerO } from '@/components/ui/divider-o';
import { Field } from '@/components/ui/field';
import { attachIdentificationPhoto } from '@/lib/ai';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, layout, palette, space, type as typography } from '@/theme/tokens';

const LAST_WATERED_OPTIONS: {
  value: LastWateredChoice;
  label: string;
  description: string;
}[] = [
  { value: 'today', label: 'Hoy', description: 'La regué recién' },
  { value: 'few_days', label: 'Hace unos días', description: 'Lo recuerdo más o menos' },
  { value: 'over_week', label: 'Hace más de una semana', description: 'Ya pasó un tiempo' },
  { value: 'unknown', label: 'No sé', description: 'Podemos empezar igual' },
];

export default function NombreScreen() {
  const { draft, updateDraft, clearDraft } = useOnboardingDraft();
  const { refreshProfile } = useSession();
  const offline = useOffline();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [completedName, setCompletedName] = useState<string>();
  const [photoWarning, setPhotoWarning] = useState(false);

  // Los tres pasos son obligatorios. Un deep link no puede saltarse especie o
  // ubicación y completar un perfil incompleto.
  useEffect(() => {
    if (!draft.species) router.replace('/especie');
    else if (!draft.location) router.replace('/ubicacion');
  }, [draft.location, draft.species]);

  async function finish() {
    if (!draft.species || !draft.location || !draft.lastWateredChoice) return;

    const nickname = draft.nickname.trim();
    if (!nickname) return;

    setLoading(true);
    setError(undefined);

    const { data, error: rpcError } = await supabase.rpc('complete_plant_onboarding', {
      p_nickname: nickname,
      p_location: draft.location,
      p_species_id: draft.species.id,
      p_window_orientation: draft.windowOrientation,
      p_light_distance: draft.lightDistance,
      p_sun_exposure: draft.sunExposure,
      p_rain_shelter: draft.rainShelter,
      p_pot_size: draft.potSize,
      p_pot_material: draft.potMaterial,
      p_last_watered_choice: draft.lastWateredChoice,
    });

    if (rpcError) {
      setError(onboardingErrorMessage(rpcError.message));
      setLoading(false);
      return;
    }

    const plantId = firstPlantId(data);
    if (draft.identificationAttemptId && plantId) {
      try {
        await attachIdentificationPhoto(draft.identificationAttemptId, plantId);
      } catch {
        setPhotoWarning(true);
      }
    } else if (draft.identificationAttemptId) {
      setPhotoWarning(true);
    }

    // El perfil ya cambió en Postgres, pero no se invalida la query todavía: así el
    // guard no desmonta esta ruta antes de que la planta alcance a presentarse.
    setCompletedName(nickname);
    await new Promise((resolve) => setTimeout(resolve, 1900));
    await clearDraft();
    await refreshProfile();
  }

  if (completedName) return <FirstGreeting name={completedName} photoWarning={photoWarning} />;

  const canSubmit =
    draft.nickname.trim().length > 0 &&
    draft.lastWateredChoice !== null &&
    draft.species !== null &&
    draft.location !== null &&
    !offline;

  return (
    <OnboardingScaffold
      step={3}
      title="¿Cómo se llama?"
      description="Ponle el nombre que quieras. Así te voy a hablar."
      footer={
        <Button label="Listo" onPress={finish} loading={loading} disabled={!canSubmit} />
      }
    >
      <Field
        label="Nombre"
        value={draft.nickname}
        onChangeText={(nickname) => updateDraft({ nickname })}
        placeholder="Olivia"
        autoCapitalize="words"
        autoComplete="off"
        maxLength={60}
        editable={!loading}
        returnKeyType="done"
        leadingIcon={<Leaf size={18} color={colors.textFaint} strokeWidth={2.2} />}
      />

      <DividerO label="y una cosa más" />

      <QuestionBlock title="¿Cuándo la regaste por última vez?">
        <View accessibilityRole="radiogroup" style={styles.waterGrid}>
          {LAST_WATERED_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              label={option.label}
              description={option.description}
              compact
              selected={draft.lastWateredChoice === option.value}
              onPress={() => updateDraft({ lastWateredChoice: option.value })}
              illustration={
                <Droplets
                  size={24}
                  color={draft.lastWateredChoice === option.value ? colors.actionPrimaryHover : palette.violet500}
                  strokeWidth={2.1}
                />
              }
              style={styles.waterChoice}
            />
          ))}
        </View>
      </QuestionBlock>

      {offline ? (
        <Banner
          tone="offline"
          message="No puedo guardar mis datos sin conexión. Los conservaré aquí hasta que vuelva la red."
        />
      ) : null}
      {error ? <Banner tone="atencion" message={error} /> : null}
    </OnboardingScaffold>
  );
}

function FirstGreeting({ name, photoWarning }: { name: string; photoWarning: boolean }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <View
      style={[
        styles.greetingRoot,
        { paddingTop: insets.top + space[8], paddingBottom: insets.bottom + space[8] },
      ]}
    >
      <View style={styles.greetingHero}>
        <View style={styles.mascotWrap}>
          <MascotHalo size={248} style={styles.halo} />
          <Animated.View entering={reduceMotion ? undefined : FadeIn.springify().damping(13).mass(0.6)}>
            <FloryMascot pose="saluda" height={230} />
          </Animated.View>
        </View>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(420).delay(180)}
          style={styles.greetingCopy}
        >
          <Text style={styles.greetingTitle}>Hola, soy {name}</Text>
          <Text style={styles.greetingText}>Estoy bien por ahora. Te aviso cuando necesite algo 💚</Text>
          {photoWarning ? (
            <Banner
              tone="atencion"
              message="Guardé mis cuidados, pero la foto no alcanzó a quedar en mi ficha. Puedes agregarla después."
            />
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function firstPlantId(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || !('plant_id' in row)) return null;
  return typeof row.plant_id === 'string' ? row.plant_id : null;
}

function onboardingErrorMessage(message: string): string {
  if (message.includes('limite_plantas_alcanzado')) {
    return 'Alcancé el límite de plantas de esta cuenta. No se perdió lo que completaste.';
  }
  if (message.includes('especie_no_disponible')) {
    return 'Esa especie ya no está disponible. Vuelve y elige otra para que pueda continuar.';
  }
  if (message.includes('nombre_')) {
    return 'Necesito un nombre más corto para poder guardarlo.';
  }
  return 'No pude guardar mis datos. Inténtalo de nuevo en un momento.';
}

const styles = StyleSheet.create({
  waterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  waterChoice: {
    flexGrow: 0,
    flexBasis: '47%',
  },
  greetingRoot: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bgPage,
  },
  greetingHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[10],
  },
  mascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    bottom: -10,
  },
  greetingCopy: {
    alignItems: 'center',
    gap: space[3],
  },
  greetingTitle: {
    ...typography.h1,
    color: colors.textHeading,
    textAlign: 'center',
  },
  greetingText: {
    ...typography.lg,
    color: colors.textBody,
    textAlign: 'center',
    maxWidth: 320,
  },
});
