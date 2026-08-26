import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Droplets, Leaf, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { ChoiceCard, ChoiceChip, ChoiceRow, QuestionBlock } from '@/components/onboarding/choices';
import type {
  LastWateredChoice,
  SpeciesChoice,
} from '@/components/onboarding/onboarding-draft';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { SpeciesSearch } from '@/components/plant/species-search';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { attachIdentificationPhoto } from '@/lib/ai';
import {
  LIGHT_DISTANCE_OPTIONS,
  POT_MATERIAL_OPTIONS,
  POT_SIZE_OPTIONS,
  SUN_TIME_OPTIONS,
  type LightDistance,
  type LocationType,
  type PotMaterial,
  type PotSize,
  type RainShelter,
  type SunExposure,
  type WindowOrientation,
} from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, layout, palette, space, type as typography } from '@/theme/tokens';

const SUN_OPTIONS: [SunExposure, string][] = [
  ['sol_todo_dia', 'Todo el día'],
  ['sol_manana', 'Solo mañana'],
  ['sol_tarde', 'Solo tarde'],
  ['sombra_parcial', 'Semisombra'],
  ['sombra', 'Sombra'],
];

const RAIN_OPTIONS: [RainShelter, string][] = [
  ['descubierta', 'Descubierta'],
  ['alero', 'Bajo alero'],
  ['techada', 'Techada'],
];

const LAST_WATERED_OPTIONS: { value: LastWateredChoice; label: string; description: string }[] = [
  { value: 'today', label: 'Hoy', description: 'La regué recién' },
  { value: 'few_days', label: 'Hace unos días', description: 'Lo recuerdo más o menos' },
  { value: 'over_week', label: 'Hace más de una semana', description: 'Ya pasó un tiempo' },
  { value: 'unknown', label: 'No sé', description: 'Podemos empezar igual' },
];

/**
 * Alta de la segunda planta en adelante.
 *
 * Los tres pasos son los del onboarding, pero el estado vive acá y no en el draft
 * persistido: ese draft existe para sobrevivir a que la app se cierre a medio registro,
 * y una planta añadida desde dentro no necesita esa red. Mantenerlos separados evita
 * además que este formulario pise el borrador de alguien que aún no termina su alta.
 *
 * No usa `complete_plant_onboarding`: ese RPC devuelve la primera planta existente en
 * vez de crear otra. Va contra `create_plant`.
 */
export default function NuevaPlantaScreen() {
  const { userId, profile } = useSession();
  const offline = useOffline();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [species, setSpecies] = useState<SpeciesChoice | null>(null);
  const [identificationAttemptId, setIdentificationAttemptId] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationType | null>(null);
  const [windowOrientation, setWindowOrientation] = useState<WindowOrientation | null>(null);
  const [windowUnknown, setWindowUnknown] = useState(false);
  const [lightDistance, setLightDistance] = useState<LightDistance | null>(null);
  const [lightUnknown, setLightUnknown] = useState(false);
  const [sunExposure, setSunExposure] = useState<SunExposure | null>(null);
  const [rainShelter, setRainShelter] = useState<RainShelter | null>(null);
  const [potSize, setPotSize] = useState<PotSize | null>(null);
  const [potMaterial, setPotMaterial] = useState<PotMaterial | null>(null);
  const [nickname, setNickname] = useState('');
  const [lastWatered, setLastWatered] = useState<LastWateredChoice | null>(null);
  const [error, setError] = useState<string>();

  const plans = useQuery({
    queryKey: queryKeys.plans(),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error: plansError } = await supabase
        .from('plans')
        .select('tier, max_plants');
      if (plansError) throw plansError;
      return data as { tier: string; max_plants: number | null }[];
    },
  });

  const plantCount = useQuery({
    queryKey: queryKeys.plantCount(userId ?? 'anon'),
    enabled: userId !== null,
    queryFn: async () => {
      const { count, error: countError } = await supabase
        .from('plants')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);
      if (countError) throw countError;
      return count ?? 0;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('create_plant', {
        p_nickname: nickname.trim(),
        p_location: location,
        p_species_id: species?.id ?? null,
        p_window_orientation: windowOrientation,
        p_light_distance: lightDistance,
        p_sun_exposure: sunExposure,
        p_rain_shelter: rainShelter,
        p_pot_size: potSize,
        p_pot_material: potMaterial,
        p_last_watered_choice: lastWatered ?? 'unknown',
      });

      if (rpcError) throw rpcError;
      const plantId = firstPlantId(data);
      let photoFailed = false;

      if (identificationAttemptId && plantId) {
        try {
          await attachIdentificationPhoto(identificationAttemptId, plantId);
        } catch {
          photoFailed = true;
        }
      } else if (identificationAttemptId) {
        photoFailed = true;
      }

      return { plantId, photoFailed };
    },
    onSuccess: async ({ photoFailed }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId ?? 'anon') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.plantCount(userId ?? 'anon') });
      if (photoFailed) {
        Alert.alert(
          'Ya estoy en tu colección',
          'No pude guardar mi foto de identificación. Puedes agregarla después desde mi ficha.',
          [{ text: 'Entendido', onPress: () => router.back() }],
          { cancelable: false }
        );
        return;
      }
      router.back();
    },
    onError: (mutationError: { message?: string }) => {
      setError(createPlantErrorMessage(mutationError.message ?? ''));
    },
  });

  const maxPlants = plans.data?.find((plan) => plan.tier === profile?.plan)?.max_plants ?? null;
  const limitReached =
    maxPlants !== null && plantCount.data !== undefined && plantCount.data >= maxPlants;
  const checkingLimit = plans.isPending || plantCount.isPending;

  // El aviso de límite va ANTES de pedir datos, nunca después de llenarlos
  // (FlorySpec §457).
  if (checkingLimit) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.actionPrimary} />
      </View>
    );
  }

  if (limitReached) {
    return (
      <View style={styles.centered}>
        <View style={styles.limitIcon}>
          <Lock size={30} color={colors.textMuted} strokeWidth={2} />
        </View>
        <Text style={styles.limitTitle}>Llegaste al máximo de tu plan</Text>
        <Text style={styles.limitText}>
          Tu plan permite {maxPlants} {maxPlants === 1 ? 'planta' : 'plantas'}. Puedes archivar
          una que ya no cuides para hacer espacio.
        </Text>
        <Button label="Entendido" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const canContinue =
    step === 1 ? species !== null : step === 2 ? location !== null : nickname.trim().length > 0 && lastWatered !== null;

  const handleNext = () => {
    setError(undefined);
    if (step === 3) {
      create.mutate();
      return;
    }
    setStep((current) => (current === 1 ? 2 : 3));
  };

  const handleBack = () => {
    setError(undefined);
    if (step === 1) {
      router.back();
      return;
    }
    setStep((current) => (current === 3 ? 2 : 1));
  };

  const setLocationAndClear = (next: LocationType) => {
    setLocation(next);
    // Los campos del modo contrario no viajan escondidos al RPC.
    if (next === 'indoor') {
      setSunExposure(null);
      setRainShelter(null);
    } else {
      setWindowOrientation(null);
      setWindowUnknown(false);
      setLightDistance(null);
      setLightUnknown(false);
    }
  };

  return (
    <OnboardingScaffold
      variant="modal"
      step={step}
      title={STEP_TITLE[step]}
      description={STEP_DESCRIPTION[step]}
      onBack={handleBack}
      footer={
        <View style={styles.footer}>
          <Button
            label={step === 3 ? 'Agregar planta' : 'Continuar'}
            disabled={!canContinue || offline}
            loading={create.isPending}
            onPress={handleNext}
          />
          <Button label="Atrás" variant="ghost" size="md" onPress={handleBack} />
        </View>
      }
    >
      {offline ? (
        <Banner
          tone="offline"
          message="No puedo guardar una planta nueva sin conexión. Vuelve a intentarlo cuando haya red."
        />
      ) : null}

      {error ? <Banner tone="atencion" message={error} /> : null}

      {step === 1 ? (
        <SpeciesSearch
          selected={species}
          identificationAttemptId={identificationAttemptId}
          onSelect={(nextSpecies, attemptId) => {
            setSpecies(nextSpecies);
            setIdentificationAttemptId(attemptId);
          }}
          offline={offline}
          autoFocus={false}
        />
      ) : null}

      {step === 2 ? (
        <>
          <View accessibilityRole="radiogroup" style={styles.locationCards}>
            <ChoiceCard
              label="Interior"
              description="Dentro de casa"
              selected={location === 'indoor'}
              onPress={() => setLocationAndClear('indoor')}
            />
            <ChoiceCard
              label="Exterior"
              description="Patio, terraza o balcón"
              selected={location === 'outdoor'}
              onPress={() => setLocationAndClear('outdoor')}
            />
          </View>

          {location === 'indoor' ? (
            <>
              <QuestionBlock title="¿A qué hora le llega el sol?" optional>
                <View accessibilityRole="radiogroup" style={styles.stack}>
                  {SUN_TIME_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.label}
                      label={option.label}
                      description={option.description}
                      selected={
                        option.value === null ? windowUnknown : windowOrientation === option.value
                      }
                      onPress={() => {
                        setWindowOrientation(option.value);
                        setWindowUnknown(option.value === null);
                      }}
                    />
                  ))}
                </View>
              </QuestionBlock>

              <QuestionBlock title="¿Qué tan cerca de la ventana está?" optional>
                <View accessibilityRole="radiogroup" style={styles.stack}>
                  {LIGHT_DISTANCE_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.label}
                      label={option.label}
                      description={option.description}
                      selected={
                        option.value === null ? lightUnknown : lightDistance === option.value
                      }
                      onPress={() => {
                        setLightDistance(option.value);
                        setLightUnknown(option.value === null);
                      }}
                    />
                  ))}
                </View>
              </QuestionBlock>
            </>
          ) : null}

          {location === 'outdoor' ? (
            <>
              <QuestionBlock title="¿Cuánto sol recibe?" optional>
                <View accessibilityRole="radiogroup" style={styles.chips}>
                  {SUN_OPTIONS.map(([value, label]) => (
                    <ChoiceChip
                      key={value}
                      label={label}
                      selected={sunExposure === value}
                      onPress={() => setSunExposure(value)}
                    />
                  ))}
                </View>
              </QuestionBlock>

              <QuestionBlock title="¿Le llega la lluvia?" optional>
                <View accessibilityRole="radiogroup" style={styles.chips}>
                  {RAIN_OPTIONS.map(([value, label]) => (
                    <ChoiceChip
                      key={value}
                      label={label}
                      selected={rainShelter === value}
                      onPress={() => setRainShelter(value)}
                    />
                  ))}
                </View>
              </QuestionBlock>
            </>
          ) : null}

          {location ? (
            <>
              <QuestionBlock title="¿Cómo es la maceta?" optional>
                <View accessibilityRole="radiogroup" style={styles.chips}>
                  {POT_SIZE_OPTIONS.map((option) => (
                    <ChoiceChip
                      key={option.value}
                      label={option.label}
                      selected={potSize === option.value}
                      onPress={() => setPotSize(option.value)}
                    />
                  ))}
                </View>
              </QuestionBlock>

              <QuestionBlock title="¿De qué material?" optional>
                <View accessibilityRole="radiogroup" style={styles.stack}>
                  {POT_MATERIAL_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.value}
                      label={option.label}
                      description={option.description}
                      selected={potMaterial === option.value}
                      onPress={() => setPotMaterial(option.value)}
                    />
                  ))}
                </View>
              </QuestionBlock>
            </>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Field
            label="Nombre"
            value={nickname}
            onChangeText={setNickname}
            placeholder="Olivia"
            autoCapitalize="words"
            autoComplete="off"
            maxLength={60}
            editable={!create.isPending}
            returnKeyType="done"
            leadingIcon={<Leaf size={18} color={colors.textFaint} strokeWidth={2.2} />}
          />

          <QuestionBlock title="¿Cuándo la regaste por última vez?">
            <View accessibilityRole="radiogroup" style={styles.waterGrid}>
              {LAST_WATERED_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  compact
                  selected={lastWatered === option.value}
                  onPress={() => setLastWatered(option.value)}
                  illustration={
                    <Droplets
                      size={24}
                      color={
                        lastWatered === option.value
                          ? colors.actionPrimaryHover
                          : palette.violet500
                      }
                      strokeWidth={2.1}
                    />
                  }
                  style={styles.waterChoice}
                />
              ))}
            </View>
          </QuestionBlock>
        </>
      ) : null}
    </OnboardingScaffold>
  );
}

const STEP_TITLE: Record<1 | 2 | 3, string> = {
  1: '¿Qué planta agregas?',
  2: '¿Dónde va a vivir?',
  3: '¿Cómo se llama?',
};

const STEP_DESCRIPTION: Record<1 | 2 | 3, string> = {
  1: 'Búscala en la lista para calcular bien sus tiempos de riego.',
  2: 'La luz, el aire y la lluvia cambian cuánto dura el agua en su tierra.',
  3: 'Ponle el nombre que quieras. Así te va a hablar.',
};

function createPlantErrorMessage(message: string): string {
  if (message.includes('limite_plantas_alcanzado')) {
    return 'Llegaste al máximo de plantas de tu plan. No se perdió lo que completaste.';
  }
  if (message.includes('especie_no_disponible')) {
    return 'Esa especie ya no está disponible. Vuelve al primer paso y elige otra.';
  }
  if (message.includes('nombre_demasiado_largo')) {
    return 'Ese nombre es muy largo. Prueba con uno más corto.';
  }
  if (message.includes('nombre_requerido')) {
    return 'Necesito un nombre para poder guardarla.';
  }
  if (message.includes('no_autorizado') || message.includes('perfil_no_encontrado')) {
    return 'Tu sesión expiró. Vuelve a entrar para agregar la planta.';
  }
  // Mientras la migración no esté aplicada, PostgREST responde que no encuentra la
  // función. Es un caso de instalación, no del usuario, pero igual merece una salida.
  if (message.includes('Could not find the function')) {
    return 'Todavía no puedo agregar plantas nuevas en este proyecto. Falta activar una actualización del servidor.';
  }
  return 'No pude agregar la planta. Inténtalo de nuevo en un momento.';
}

function firstPlantId(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || !('plant_id' in row)) return null;
  return typeof row.plant_id === 'string' ? row.plant_id : null;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bgPage,
  },
  limitIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  limitTitle: {
    ...typography.h3,
    color: colors.textHeading,
    textAlign: 'center',
  },
  limitText: {
    ...typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: space[4],
  },
  footer: {
    gap: space[1],
  },
  locationCards: {
    flexDirection: 'row',
    gap: space[3],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  stack: {
    gap: space[2],
  },
  waterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
  },
  waterChoice: {
    flexGrow: 0,
    flexBasis: '47%',
  },
});
