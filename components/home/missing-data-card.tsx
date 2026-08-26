import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Sprout, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { HomePlant } from '@/lib/home-plants';
import {
  POT_MATERIAL_OPTIONS,
  POT_SIZE_OPTIONS,
  type PotMaterial,
  type PotSize,
} from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space, type as typography } from '@/theme/tokens';

/**
 * Pregunta contextual por un dato que falta (FlorySpec §300, §646).
 *
 * Tres reglas del spec, y las tres importan:
 *  - **Una pregunta a la vez.** Responder no encadena la siguiente.
 *  - **Máximo una por semana.** Tanto descartar como responder abren el mismo
 *    período de silencio, para que la card no se vuelva un cobrador.
 *  - **Descartable sin costo.** La X no penaliza ni vuelve a insistir mañana.
 *
 * La clave del silencio va por planta: dos plantas distintas pueden tener huecos
 * distintos y silenciar una no debería silenciar a la otra.
 */

const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 86_400_000;

type Question =
  | { field: 'pot_size'; title: string; options: { value: PotSize; label: string }[] }
  | { field: 'pot_material'; title: string; options: { value: PotMaterial; label: string }[] };

export function MissingDataCard({ plant, userId }: { plant: HomePlant; userId: string }) {
  const queryClient = useQueryClient();
  const [silenced, setSilenced] = useState<boolean | null>(null);
  const [savedInterval, setSavedInterval] = useState<number | null | undefined>(undefined);

  const storageKey = `flory.datos-pendientes.${plant.id}`;
  const question = nextQuestion(plant);

  useEffect(() => {
    let active = true;

    SecureStore.getItemAsync(storageKey)
      .then((value) => {
        if (!active) return;
        const until = value ? Number.parseInt(value, 10) : null;
        setSilenced(until !== null && Number.isFinite(until) && Date.now() < until);
      })
      .catch(() => {
        // Sin acceso al almacenamiento se prefiere preguntar: perder la card es peor
        // que repetir la pregunta.
        if (active) setSilenced(false);
      });

    return () => {
      active = false;
    };
  }, [storageKey]);

  const answer = useMutation({
    mutationFn: async (value: PotSize | PotMaterial) => {
      if (!question) return null;

      const { error } = await supabase
        .from('plants')
        .update({ [question.field]: value })
        .eq('id', plant.id);

      if (error) throw error;

      // El intervalo lo recalcula Postgres, nunca el cliente. Devuelve null si la
      // planta no tiene especie: `recompute_plant_interval` hace join contra
      // `species` (security.sql:243), así que ahí no hay nada que recalcular.
      const { data, error: rpcError } = await supabase.rpc('recompute_plant_interval', {
        p_plant_id: plant.id,
      });

      if (rpcError) throw rpcError;
      return (data as number | null) ?? null;
    },
    onSuccess: async (interval) => {
      await silence(storageKey);
      setSavedInterval(interval);
      await queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.plantSummary(plant.id) });
    },
  });

  async function dismiss() {
    setSilenced(true);
    await silence(storageKey);
  }

  // El acuse de recibo manda sobre todo lo demás: quien acaba de responder tiene que
  // ver el efecto aunque la pregunta ya no exista y el silencio ya esté puesto.
  if (savedInterval !== undefined) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.card, styles.cardDone]}>
        <Sprout size={20} color={colors.actionPrimaryHover} strokeWidth={2.2} />
        <Text style={styles.doneText}>
          {savedInterval === null
            ? 'Anotado. Me ayuda a conocerme mejor.'
            : `Anotado. Ajusté mi riego a cada ${savedInterval} días.`}
        </Text>
      </Animated.View>
    );
  }

  // `silenced === null` es «todavía no sé»: pintar la card y esconderla un frame
  // después haría saltar el layout del Home.
  if (silenced !== false || !question) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(180)}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.question}>{question.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          hitSlop={10}
          disabled={answer.isPending}
          onPress={dismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <X size={17} color={colors.textMuted} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Botones y no radios: tocar una opción la guarda, no la preselecciona. */}
      <View style={styles.options}>
        {question.options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            disabled={answer.isPending}
            onPress={() => answer.mutate(option.value)}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <Text style={styles.optionLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {answer.isError ? (
        <Text style={styles.error}>No pude guardarlo. Lo intentamos de nuevo cuando quieras.</Text>
      ) : null}

      {answer.isPending ? (
        <View accessibilityLabel="Guardando" style={styles.pending}>
          <ActivityIndicator size="small" color={colors.actionPrimary} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function nextQuestion(plant: HomePlant): Question | null {
  if (plant.potSize === null) {
    return {
      field: 'pot_size',
      title: 'Para saber cuánta agua pierdo, ¿en qué maceta estoy?',
      options: POT_SIZE_OPTIONS.map(({ value, label }) => ({ value, label })),
    };
  }

  if (plant.potMaterial === null) {
    return {
      field: 'pot_material',
      title: '¿De qué está hecha mi maceta?',
      options: POT_MATERIAL_OPTIONS.map(({ value, label }) => ({ value, label })),
    };
  }

  return null;
}

async function silence(storageKey: string) {
  await SecureStore.setItemAsync(storageKey, String(Date.now() + COOLDOWN_MS)).catch(() => {});
}

const styles = StyleSheet.create({
  card: {
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    position: 'relative',
  },
  cardDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBrandSoft,
  },
  doneText: {
    ...typography.sm,
    flex: 1,
    color: colors.textBody,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  question: {
    ...typography.md,
    flex: 1,
    color: colors.textHeading,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  option: {
    minHeight: 44,
    paddingHorizontal: space[4],
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgPageAlt,
  },
  optionLabel: {
    ...typography.sm,
    fontFamily: fonts.bodySemibold,
    color: colors.textBody,
  },
  error: {
    ...typography.xs,
    color: colors.textMuted,
  },
  pending: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  pressed: {
    opacity: 0.7,
  },
});
