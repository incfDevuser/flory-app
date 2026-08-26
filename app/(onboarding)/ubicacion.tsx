import { router } from 'expo-router';
import { CloudRain, House, Sprout, SunMedium } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChoiceCard, ChoiceChip, ChoiceRow, QuestionBlock } from '@/components/onboarding/choices';
import { useOnboardingDraft } from '@/components/onboarding/onboarding-draft';
import { OnboardingScaffold } from '@/components/onboarding/onboarding-scaffold';
import { Button } from '@/components/ui/button';
import {
  LIGHT_DISTANCE_OPTIONS,
  POT_MATERIAL_OPTIONS,
  POT_SIZE_OPTIONS,
  SUN_TIME_OPTIONS,
} from '@/lib/plant-vocab';
import { colors, palette, radius, space, type as typography } from '@/theme/tokens';

const SUN_OPTIONS = [
  ['sol_todo_dia', 'Todo el día'],
  ['sol_manana', 'Solo mañana'],
  ['sol_tarde', 'Solo tarde'],
  ['sombra_parcial', 'Semisombra'],
  ['sombra', 'Sombra'],
] as const;

const RAIN_OPTIONS = [
  ['descubierta', 'Descubierta'],
  ['alero', 'Bajo alero'],
  ['techada', 'Techada'],
] as const;

export default function UbicacionScreen() {
  const { draft, setLocation, updateDraft } = useOnboardingDraft();

  return (
    <OnboardingScaffold
      step={2}
      title="¿Dónde vive?"
      description="La luz, el aire y la lluvia cambian cuánto tiempo guardo el agua."
      footer={
        <Button
          label="Continuar"
          disabled={!draft.location}
          onPress={() => router.push('/nombre')}
        />
      }
    >
      <View accessibilityRole="radiogroup" style={styles.locationCards}>
        <ChoiceCard
          label="Interior"
          description="Dentro de casa"
          selected={draft.location === 'indoor'}
          onPress={() => setLocation('indoor')}
          illustration={<IndoorScene />}
        />
        <ChoiceCard
          label="Exterior"
          description="Patio, terraza o balcón"
          selected={draft.location === 'outdoor'}
          onPress={() => setLocation('outdoor')}
          illustration={<OutdoorScene />}
        />
      </View>

      {draft.location ? (
        <Animated.View entering={FadeInDown.duration(280)} style={styles.optionalSection}>
          <View style={styles.optionalIntro}>
            <Text style={styles.optionalTitle}>Cuéntame un poco más</Text>
            <Text style={styles.optionalText}>Todo lo que sigue es opcional. Puedes completarlo después.</Text>
          </View>

          {draft.location === 'indoor' ? (
            <>
              {/*
                Se pregunta por el horario del sol y no por el punto cardinal: casi
                nadie sabe hacia dónde mira su ventana, pero todo el mundo sabe si el
                sol le llega en la mañana o en la tarde. La traducción vive en
                `SUN_TIME_OPTIONS` y asume hemisferio sur.
              */}
              <QuestionBlock title="¿A qué hora le llega el sol?" optional>
                <View accessibilityRole="radiogroup" style={styles.stack}>
                  {SUN_TIME_OPTIONS.map((option) => (
                    <ChoiceRow
                      key={option.label}
                      label={option.label}
                      description={option.description}
                      selected={
                        option.value === null
                          ? draft.windowUnknown
                          : draft.windowOrientation === option.value
                      }
                      onPress={() =>
                        updateDraft({
                          windowOrientation: option.value,
                          windowUnknown: option.value === null,
                        })
                      }
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
                        option.value === null
                          ? draft.lightUnknown
                          : draft.lightDistance === option.value
                      }
                      onPress={() =>
                        updateDraft({
                          lightDistance: option.value,
                          lightUnknown: option.value === null,
                        })
                      }
                    />
                  ))}
                </View>
              </QuestionBlock>
            </>
          ) : (
            <>
              <QuestionBlock title="¿Cuánto sol recibe?" optional>
                <View accessibilityRole="radiogroup" style={styles.chips}>
                  {SUN_OPTIONS.map(([value, label]) => (
                    <ChoiceChip
                      key={value}
                      label={label}
                      selected={draft.sunExposure === value}
                      onPress={() => updateDraft({ sunExposure: value })}
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
                      selected={draft.rainShelter === value}
                      onPress={() => updateDraft({ rainShelter: value })}
                    />
                  ))}
                </View>
              </QuestionBlock>
            </>
          )}

          <View style={styles.separator} />

          <QuestionBlock title="¿Cómo es la maceta?" optional>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {POT_SIZE_OPTIONS.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  selected={draft.potSize === option.value}
                  onPress={() => updateDraft({ potSize: option.value })}
                />
              ))}
            </View>
          </QuestionBlock>

          {/*
            Greda y cerámica no son sinónimos para el motor: la greda transpira y baja
            el intervalo un 20 % (tables.sql:486). Por eso van descritas por cómo se
            ven, no solo nombradas.
          */}
          <QuestionBlock title="¿De qué material?" optional>
            <View accessibilityRole="radiogroup" style={styles.stack}>
              {POT_MATERIAL_OPTIONS.map((option) => (
                <ChoiceRow
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  selected={draft.potMaterial === option.value}
                  onPress={() => updateDraft({ potMaterial: option.value })}
                />
              ))}
            </View>
          </QuestionBlock>
        </Animated.View>
      ) : (
        <Text style={styles.prompt}>Elige Interior o Exterior para continuar.</Text>
      )}
    </OnboardingScaffold>
  );
}

function IndoorScene() {
  return (
    <View style={[styles.scene, styles.sceneIndoor]}>
      <House size={34} color={palette.green800} strokeWidth={2} />
      <View style={styles.indoorSun}>
        <SunMedium size={20} color={palette.amber400} strokeWidth={2.2} />
      </View>
    </View>
  );
}

function OutdoorScene() {
  return (
    <View style={[styles.scene, styles.sceneOutdoor]}>
      <SunMedium size={23} color={palette.amber400} strokeWidth={2.2} />
      <Sprout size={34} color={palette.green800} strokeWidth={2} />
      <CloudRain size={20} color={palette.violet500} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  locationCards: {
    flexDirection: 'row',
    gap: space[3],
  },
  scene: {
    width: 68,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneIndoor: {
    backgroundColor: palette.lime100,
  },
  sceneOutdoor: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: palette.green50,
  },
  indoorSun: {
    position: 'absolute',
    right: -7,
    top: -7,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.amber50,
  },
  optionalSection: {
    gap: space[8],
  },
  optionalIntro: {
    gap: space[1],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  optionalTitle: {
    ...typography.h4,
    color: colors.textHeading,
  },
  optionalText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  /** Opciones con línea de apoyo: en fila se recortaría la descripción. */
  stack: {
    gap: space[2],
  },
  separator: {
    height: 1.5,
    backgroundColor: colors.borderSubtle,
  },
  prompt: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: space[4],
  },
});
