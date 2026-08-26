import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Droplets, Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import type { HomePlant } from '@/lib/home-plants';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import {
  colors,
  elevation,
  fonts,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

type SoilFeedback = 'seca' | 'humeda' | 'empapada';
type Step = 'confirm' | 'feedback' | 'learned';

type WateringResult = {
  interval_before: number | null;
  interval_after: number | null;
};

/**
 * Las etiquetas son las del enum `soil_feedback` (tables.sql:53) y las del spec §626.
 * La descripción explica qué se siente al tocar, porque «húmeda» y «empapada» son la
 * misma palabra para mucha gente y esa confusión entra directo al motor de riego.
 */
const OPTIONS: { value: SoilFeedback; label: string; description: string }[] = [
  {
    value: 'seca',
    label: 'Seca',
    description: 'Suelta, casi polvo, despegada de la maceta',
  },
  {
    value: 'humeda',
    label: 'Húmeda',
    description: 'Seca arriba, algo fresca más abajo',
  },
  {
    value: 'empapada',
    label: 'Empapada',
    description: 'Barrosa, todavía cargada de agua',
  },
];

export function WateringSheet({
  plant,
  userId,
  onClose,
}: {
  plant: HomePlant;
  userId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('confirm');
  const [feedback, setFeedback] = useState<SoilFeedback | null>(null);
  const [result, setResult] = useState<WateringResult | null>(null);

  const watering = useMutation({
    // `null` es «no la toqué»: el trigger registra el riego y deja el intervalo
    // intacto, porque sin haber tocado la tierra no hay nada que aprender.
    mutationFn: async (value: SoilFeedback | null) => {
      const { data, error } = await supabase
        .from('watering_events')
        .insert({ plant_id: plant.id, user_id: userId, feedback: value, source: 'user' })
        .select('interval_before, interval_after')
        .single();

      if (error) throw error;
      return data as WateringResult;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.plantSummary(plant.id) });

      // Si el intervalo no se movió, no hay aprendizaje que mostrar. Un «anotado»
      // sin efecto visible es ruido (FlorySpec §642), así que el sheet se cierra y
      // el Home ya refleja la fecha nueva.
      if (!hasLearned(data)) {
        onClose();
        return;
      }

      setResult(data);
      setStep('learned');
    },
  });

  const close = () => {
    if (!watering.isPending) onClose();
  };

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.modal}>
        <Pressable accessibilityLabel="Cerrar" onPress={close} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }]}>
          <View style={styles.handle} />

          {step === 'confirm' ? (
            <>
              <SheetHeader icon="drops" onClose={close} />
              <Text style={styles.title}>¿Regaste a {plant.nickname}?</Text>
              <Text style={styles.body}>
                Quiero asegurarme antes de guardar el riego y ajustar mi próximo aviso.
              </Text>
              <View style={styles.actions}>
                <Button label="Sí, la regué" onPress={() => setStep('feedback')} />
                <Button label="Todavía no" variant="ghost" onPress={close} />
              </View>
            </>
          ) : null}

          {step === 'feedback' ? (
            <>
              <SheetHeader icon="drops" onClose={close} />
              <Text style={styles.title}>¿Cómo estaba mi tierra?</Text>
              <Text style={styles.body}>Con esto aprendo si debo avisarte un poco antes o después.</Text>

              <View style={styles.options}>
                {OPTIONS.map((option) => {
                  const selected = feedback === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setFeedback(option.value)}
                      style={({ pressed }) => [
                        styles.option,
                        selected && styles.optionSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <Check size={14} color={colors.textOnBrand} strokeWidth={3} /> : null}
                      </View>
                      <View style={styles.optionText}>
                        <Text style={styles.optionLabel}>{option.label}</Text>
                        <Text style={styles.optionDescription}>{option.description}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {watering.isError ? (
                <Banner message="No pude guardar el riego. Tus datos siguen intactos; intentémoslo otra vez." />
              ) : null}

              <Button
                label="Guardar riego"
                disabled={feedback === null}
                loading={watering.isPending}
                onPress={() => feedback && watering.mutate(feedback)}
              />

              {/* Salida honesta: regar sin haber tocado la tierra es lo más común. */}
              <Pressable
                accessibilityRole="button"
                disabled={watering.isPending}
                onPress={() => watering.mutate(null)}
                hitSlop={8}
                style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
              >
                <Text style={styles.skipLabel}>No la toqué</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'learned' ? (
            <>
              <SheetHeader icon="learned" onClose={close} />
              <View style={styles.learnedIcon}>
                <Sparkles size={30} color={palette.violet500} strokeWidth={2.2} />
              </View>
              <Text style={styles.title}>Aprendí algo nuevo</Text>
              <Text style={styles.body}>{getLearnedCopy(result)}</Text>
              {/*
                El número es la mitad del momento: la persona tiene que ver que la app
                cambió por algo que ella respondió (FlorySpec §638).
              */}
              <Text style={styles.nextWatering}>{getNextWateringCopy(result)}</Text>
              <Button label="Listo" onPress={close} style={styles.doneButton} />
            </>
          ) : null}

          {watering.isPending ? (
            <View accessibilityLabel="Guardando riego" style={styles.pendingShield}>
              <ActivityIndicator color={colors.actionPrimary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SheetHeader({ icon, onClose }: { icon: 'drops' | 'learned'; onClose: () => void }) {
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.headerIcon}>
        {icon === 'drops' ? (
          <Droplets size={22} color={colors.actionPrimaryHover} strokeWidth={2.2} />
        ) : (
          <Sparkles size={22} color={palette.violet500} strokeWidth={2.2} />
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
        <X size={21} color={colors.textMuted} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

/**
 * Hubo aprendizaje solo si el intervalo se movió de verdad.
 *
 * No basta con mirar el feedback: el trigger acota el resultado entre el mínimo y el
 * máximo de la especie (tables.sql:485), así que una planta que ya está en su límite
 * puede recibir «seca» y quedarse igual. En ese caso no cambió nada y no hay nada que
 * celebrar.
 */
function hasLearned(result: WateringResult): boolean {
  if (result.interval_before === null || result.interval_after === null) return false;
  return result.interval_after !== result.interval_before;
}

function getLearnedCopy(result: WateringResult | null): string {
  if (!result || result.interval_before === null || result.interval_after === null) {
    return 'Guardé mi riego y ajusté mi ritmo con lo que me contaste.';
  }
  if (result.interval_after < result.interval_before) {
    return 'Anotado: mi tierra estaba seca, así que la próxima vez te voy a avisar un poco antes.';
  }
  return 'Anotado: todavía me quedaba agua, así que la próxima vez voy a esperar un poco más.';
}

function getNextWateringCopy(result: WateringResult | null): string {
  const days = result?.interval_after ?? null;
  if (days === null) return 'Te aviso cuando toque mi próxima agua.';
  if (days === 1) return 'Próxima agua en 1 día';
  return `Próxima agua en ${days} días`;
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,75,46,0.28)',
  },
  sheet: {
    minHeight: 350,
    paddingTop: space[3],
    paddingHorizontal: layout.gutter,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.bgPageAlt,
    ...elevation.lg,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    alignSelf: 'center',
    marginBottom: space[4],
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[3],
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  title: {
    ...typography.h2,
    color: colors.textHeading,
  },
  body: {
    ...typography.md,
    color: colors.textMuted,
    marginTop: space[2],
  },
  actions: {
    gap: space[2],
    marginTop: space[6],
  },
  options: {
    gap: space[3],
    marginVertical: space[5],
  },
  option: {
    minHeight: 74,
    padding: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  optionSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.surfaceBrandSoft,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.actionPrimary,
  },
  optionText: {
    flex: 1,
    gap: space[1],
  },
  optionLabel: {
    ...typography.md,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  optionDescription: {
    ...typography.sm,
    color: colors.textMuted,
  },
  skip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[1],
  },
  skipLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  nextWatering: {
    ...typography.h4,
    color: colors.actionPrimaryHover,
    marginTop: space[4],
  },
  learnedIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.violet50,
    marginBottom: space[5],
  },
  doneButton: {
    marginTop: space[8],
  },
  pressed: {
    opacity: 0.72,
  },
  pendingShield: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: 'rgba(255,252,244,0.42)',
  },
});
