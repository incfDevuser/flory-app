import { router } from 'expo-router';
import { ChevronRight, ScanSearch } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DiagnosisEntry } from '@/lib/plant-detail';
import { elapsedLabel } from '@/lib/watering-copy';
import { colors, fonts, radius, space, type as typography } from '@/theme/tokens';

/**
 * Fila de un diagnóstico en una lista. Vive fuera de la ficha porque la usan dos
 * pantallas —el preview de la ficha y la lista completa en `plant/[id]/diagnosticos`—
 * y tienen que verse idénticas. Navega al detalle del diagnóstico.
 */

const CONFIDENCE_LABEL: Record<'alta' | 'media' | 'baja', string> = {
  alta: 'Estaba bastante segura',
  media: 'Creía que era eso, pero podía ser otra cosa',
  baja: 'No estaba segura',
};

export function DiagnosisRow({ entry, last }: { entry: DiagnosisEntry; last: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver diagnóstico: ${entry.cause ?? 'Revisión con foto'}`}
      onPress={() => router.push({ pathname: '/diagnostico/[id]', params: { id: entry.id } })}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <ScanSearch size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{entry.cause ?? 'Revisión con foto'}</Text>
        {entry.confidence ? (
          <Text style={styles.note}>{CONFIDENCE_LABEL[entry.confidence]}</Text>
        ) : null}
      </View>
      <Text style={styles.when}>{elapsedLabel(entry.createdAt)}</Text>
      <ChevronRight size={17} color={colors.textFaint} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderSubtle,
  },
  pressed: {
    backgroundColor: colors.surfaceSunken,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  note: {
    ...typography.xs,
    color: colors.textMuted,
  },
  when: {
    ...typography.xs,
    color: colors.textFaint,
  },
});
