import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/onboarding/choices';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import type { PlantDetail } from '@/lib/plant-detail';
import {
  LIGHT_DISTANCE_OPTIONS,
  POT_MATERIAL_OPTIONS,
  POT_SIZE_OPTIONS,
  SUN_TIME_OPTIONS,
  type VocabOption,
} from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import {
  colors,
  elevation,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

/**
 * Edición inline del entorno (FlorySpec §417).
 *
 * Cada campo se guarda solo y dispara `recompute_plant_interval`, porque cambiar la
 * maceta o la luz cambia cuánto dura el agua en la tierra. Si el intervalo se mueve,
 * Flory lo dice — es el mismo momento de aprendizaje del feedback de riego, y callarlo
 * sería perder la única señal de que la app usa lo que le acabas de contar.
 */

export type EnvironmentField =
  | 'location'
  | 'window_orientation'
  | 'light_distance'
  | 'sun_exposure'
  | 'rain_shelter'
  | 'pot_size'
  | 'pot_material';

const SUN_EXPOSURE_OPTIONS: VocabOption<string | null>[] = [
  { value: 'sol_todo_dia', label: 'Todo el día', description: 'Le pega el sol de la mañana a la tarde' },
  { value: 'sol_manana', label: 'Solo mañana', description: 'Sol temprano y después sombra' },
  { value: 'sol_tarde', label: 'Solo tarde', description: 'Sombra temprano y sol caído' },
  { value: 'sombra_parcial', label: 'Semisombra', description: 'Un rato de sol, el resto sombra' },
  { value: 'sombra', label: 'Sombra', description: 'Claridad, pero nunca sol directo' },
];

const RAIN_SHELTER_OPTIONS: VocabOption<string | null>[] = [
  { value: 'descubierta', label: 'Descubierta', description: 'Recibe toda la lluvia' },
  { value: 'alero', label: 'Bajo alero', description: 'Le llega algo cuando hay viento' },
  { value: 'techada', label: 'Techada', description: 'No le llega lluvia' },
];

const FIELD_CONFIG: Record<
  EnvironmentField,
  { title: string; options: VocabOption<string | null>[] }
> = {
  location: {
    title: '¿Dónde vivo?',
    options: [
      { value: 'indoor', label: 'Dentro de la casa', description: 'Vivo en un espacio interior' },
      { value: 'outdoor', label: 'Afuera', description: 'Vivo en balcón, patio o terraza' },
    ],
  },
  window_orientation: { title: '¿A qué hora le llega el sol?', options: SUN_TIME_OPTIONS },
  light_distance: { title: '¿Qué tan cerca de la ventana está?', options: LIGHT_DISTANCE_OPTIONS },
  sun_exposure: { title: '¿Cuánto sol recibe?', options: SUN_EXPOSURE_OPTIONS },
  rain_shelter: { title: '¿Le llega la lluvia?', options: RAIN_SHELTER_OPTIONS },
  pot_size: { title: '¿Cómo es la maceta?', options: POT_SIZE_OPTIONS },
  pot_material: { title: '¿De qué material?', options: POT_MATERIAL_OPTIONS },
};

export function EnvironmentSheet({
  plant,
  field,
  userId,
  onClose,
}: {
  plant: PlantDetail;
  field: EnvironmentField;
  userId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const config = FIELD_CONFIG[field];
  const [result, setResult] = useState<{ before: number; after: number | null } | null>(null);
  const [recomputeFailed, setRecomputeFailed] = useState(false);

  const save = useMutation({
    mutationFn: async (value: string | null) => {
      const update =
        field === 'location'
          ? value === 'indoor'
            ? {
                location: value,
                sun_exposure: null,
                rain_shelter: null,
              }
            : {
                location: value,
                window_orientation: null,
                light_distance: null,
              }
          : { [field]: value };

      const { error } = await supabase
        .from('plants')
        .update(update)
        .eq('id', plant.id)
        .select('id')
        .single();

      if (error) throw error;

      // El intervalo lo recalcula Postgres. Devuelve null si algo impide calcularlo.
      const { data, error: rpcError } = await supabase.rpc('recompute_plant_interval', {
        p_plant_id: plant.id,
      });

      return {
        after: (data as number | null) ?? null,
        recomputeFailed: rpcError !== null,
      };
    },
    onSuccess: async ({ after, recomputeFailed: failed }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plantDetail(plant.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId) }),
      ]);

      if (failed) {
        setRecomputeFailed(true);
        return;
      }

      // Solo se anuncia el ajuste cuando el número de verdad se movió. Anunciar un
      // cambio que no ocurrió es peor que no decir nada.
      if (after !== null && after !== plant.currentIntervalDays) {
        setResult({ before: plant.currentIntervalDays, after });
        return;
      }

      onClose();
    },
  });

  const currentValue = getCurrentValue(plant, field);
  const close = () => {
    if (!save.isPending) onClose();
  };

  return (
    <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.modal}>
        <Pressable accessibilityLabel="Cerrar" onPress={close} style={styles.backdrop} />

        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }]}
        >
          <View style={styles.handle} />

          {result ? (
            <View style={styles.learned}>
              <View style={styles.learnedIcon}>
                <Sparkles size={28} color={palette.violet500} strokeWidth={2.2} />
              </View>
              <Text style={styles.title}>Ajusté mi riego</Text>
              <Text style={styles.body}>
                {result.after !== null && result.after > result.before
                  ? 'Con eso el agua me dura más, así que voy a esperar un poco más entre riegos.'
                  : 'Con eso pierdo el agua más rápido, así que te voy a avisar un poco antes.'}
              </Text>
              <Text style={styles.interval}>
                {result.after === 1 ? 'Ahora riego cada día' : `Ahora riego cada ${result.after} días`}
              </Text>
              <Button label="Listo" onPress={onClose} style={styles.doneButton} />
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>{config.title}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  onPress={close}
                  disabled={save.isPending}
                  style={styles.close}
                >
                  <X size={21} color={colors.textMuted} strokeWidth={2.2} />
                </Pressable>
              </View>

              {save.isError ? (
                <Banner message="No pude guardar el cambio. Inténtalo de nuevo en un momento." />
              ) : null}

              {recomputeFailed ? (
                <Banner message="Guardé el cambio, pero no pude ajustar mi próximo riego. Inténtalo otra vez en un momento." />
              ) : null}

              <View pointerEvents={save.isPending ? 'none' : 'auto'}>
                <ScrollView
                  contentContainerStyle={styles.options}
                  showsVerticalScrollIndicator={false}
                >
                  {config.options.map((option) => (
                    <ChoiceRow
                      key={option.label}
                      label={option.label}
                      description={option.description}
                      selected={currentValue === option.value}
                      onPress={() => {
                        setRecomputeFailed(false);
                        save.mutate(option.value);
                      }}
                    />
                  ))}
                </ScrollView>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getCurrentValue(plant: PlantDetail, field: EnvironmentField): string | null {
  switch (field) {
    case 'location':
      return plant.location;
    case 'window_orientation':
      return plant.windowOrientation;
    case 'light_distance':
      return plant.lightDistance;
    case 'sun_exposure':
      return plant.sunExposure;
    case 'rain_shelter':
      return plant.rainShelter;
    case 'pot_size':
      return plant.potSize;
    case 'pot_material':
      return plant.potMaterial;
  }
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
    maxHeight: '82%',
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[4],
  },
  title: {
    ...typography.h3,
    flex: 1,
    color: colors.textHeading,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  options: {
    gap: space[2],
    paddingBottom: space[4],
  },
  learned: {
    alignItems: 'center',
    paddingBottom: space[4],
  },
  learnedIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.violet50,
    marginBottom: space[4],
  },
  body: {
    ...typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space[2],
  },
  interval: {
    ...typography.h4,
    color: colors.actionPrimaryHover,
    marginTop: space[4],
  },
  doneButton: {
    alignSelf: 'stretch',
    marginTop: space[6],
  },
});
