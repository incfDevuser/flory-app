import { ChevronRight } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, type as typography } from '@/theme/tokens';

type ListRowProps = {
  label: string;
  icon: ReactNode;
  /** Texto al costado derecho: un contador, el plan actual, un estado. */
  value?: string;
  /** Se muestra bajo la etiqueta. Sirve para explicar por qué algo está apagado. */
  note?: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'destructive';
};

/**
 * Fila de lista para Perfil y Ajustes.
 *
 * Una fila deshabilitada **conserva su nota**: si algo no se puede tocar todavía, el
 * usuario merece leer por qué en el mismo lugar donde lo intentó, en vez de tocar y no
 * recibir respuesta.
 */
export function ListRow({
  label,
  icon,
  value,
  note,
  onPress,
  disabled = false,
  tone = 'default',
}: ListRowProps) {
  const isInert = disabled || !onPress;
  const destructive = tone === 'destructive';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInert }}
      disabled={isInert}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && !isInert && styles.pressed]}
    >
      <View style={[styles.iconWrap, destructive && styles.iconWrapDestructive]}>{icon}</View>

      <View style={styles.copy}>
        <Text
          style={[
            styles.label,
            destructive && styles.labelDestructive,
            // Se atenúa la etiqueta, nunca la nota: la nota es justamente la
            // explicación de por qué está atenuada.
            isInert && !destructive && styles.labelInert,
          ]}
        >
          {label}
        </Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>

      {value ? <Text style={styles.value}>{value}</Text> : null}
      {isInert ? null : <ChevronRight size={19} color={colors.textFaint} strokeWidth={2.2} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    backgroundColor: colors.surfaceCard,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  iconWrapDestructive: {
    backgroundColor: colors.surfaceDestructiveSoft,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.md,
    fontFamily: fonts.bodySemibold,
    color: colors.textHeading,
  },
  labelDestructive: {
    color: colors.textDestructive,
  },
  labelInert: {
    color: colors.textMuted,
  },
  note: {
    ...typography.xs,
    color: colors.textMuted,
  },
  value: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textMuted,
  },
  pressed: {
    backgroundColor: colors.surfaceSunken,
  },
});
