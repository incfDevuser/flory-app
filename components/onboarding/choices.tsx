import { Check } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { border, colors, elevation, fonts, motion, radius, space, type as typography } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.5 } as const;

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Píldora para opciones cortas. La selección se expresa con relleno y check. */
export function ChoiceChip({ label, selected, onPress, style }: ChoiceChipProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(motion.pressScale, PRESS_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_SPRING))}
      style={[
        styles.chip,
        selected ? styles.chipSelected : null,
        animatedStyle,
        style,
      ]}
    >
      {selected ? <Check size={15} color={colors.textOnBrand} strokeWidth={3} /> : null}
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>{label}</Text>
    </AnimatedPressable>
  );
}

type ChoiceCardProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  illustration?: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Tarjeta grande para decisiones que necesitan más contexto que una palabra. */
export function ChoiceCard({
  label,
  description,
  selected,
  onPress,
  illustration,
  compact = false,
  style,
}: ChoiceCardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(motion.pressScale, PRESS_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_SPRING))}
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        selected ? styles.cardSelected : null,
        selected ? elevation.sm : null,
        animatedStyle,
        style,
      ]}
    >
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      <View style={styles.cardCopy}>
        <Text style={styles.cardLabel}>{label}</Text>
        {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.radio, selected ? styles.radioSelected : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </AnimatedPressable>
  );
}

type ChoiceRowProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Fila a ancho completo para opciones que necesitan una línea de apoyo.
 *
 * Existe porque `ChoiceChip` solo acepta etiqueta y `ChoiceCard` ancla el radio abajo
 * a la derecha —bien en una grilla de dos columnas, descolgado en una lista vertical.
 * Aquí el radio va centrado al costado, que es donde el ojo lo busca al recorrer una
 * lista.
 */
export function ChoiceRow({ label, description, selected, onPress }: ChoiceRowProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      onPressIn={() => scale.set(withSpring(motion.pressScale, PRESS_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_SPRING))}
      style={[styles.row, selected ? styles.rowSelected : null, animatedStyle]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      </View>
      <View style={[styles.rowRadio, selected ? styles.radioSelected : null]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </AnimatedPressable>
  );
}

export function QuestionBlock({
  title,
  optional = false,
  children,
}: {
  title: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.question}>
      <View style={styles.questionHeading}>
        <Text style={styles.questionTitle}>{title}</Text>
        {optional ? <Text style={styles.optional}>Opcional</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: border.width,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  chipSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.actionPrimary,
  },
  chipLabel: {
    ...typography.sm,
    fontFamily: fonts.bodySemibold,
    color: colors.textBody,
  },
  chipLabelSelected: {
    color: colors.textOnBrand,
  },
  card: {
    minHeight: 148,
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    borderWidth: border.width,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  cardCompact: {
    minHeight: 96,
  },
  cardSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.surfaceBrandSoft,
  },
  illustration: {
    minHeight: 48,
    justifyContent: 'center',
  },
  cardCopy: {
    gap: space[1],
    paddingRight: space[6],
  },
  cardLabel: {
    ...typography.h4,
    color: colors.textHeading,
  },
  cardDescription: {
    ...typography.xs,
    color: colors.textMuted,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.md,
    borderWidth: border.width,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  rowSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.surfaceBrandSoft,
  },
  rowCopy: {
    flex: 1,
    gap: space[1],
  },
  rowLabel: {
    ...typography.md,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  rowRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: border.widthStrong,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    position: 'absolute',
    right: space[4],
    bottom: space[4],
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: border.widthStrong,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.actionPrimary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.actionPrimary,
  },
  question: {
    gap: space[3],
  },
  questionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
  },
  questionTitle: {
    ...typography.h4,
    color: colors.textHeading,
  },
  optional: {
    ...typography.xs,
    color: colors.textMuted,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
});
