import { Check } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, motion, radius, space } from '@/theme/tokens';

const CHECK_SPRING = { damping: 14, stiffness: 320, mass: 0.5 } as const;

type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Se acepta nodo, no string: el de términos lleva enlaces dentro del texto. */
  label: ReactNode;
  /** Lo que oye el lector de pantalla, ya que `label` puede ser JSX. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/** 24px, radio 8, tick blanco (§8.2). */
export function Checkbox({ checked, onChange, label, accessibilityLabel, disabled = false }: CheckboxProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => {
        // El pop al marcar es el gesto de marca (§6). Va en el tick, no en toda la
        // fila: escalar el texto de términos lo haría ilegible por un instante.
        scale.set(withSpring(motion.pressScale, CHECK_SPRING, () => {
          scale.set(withSpring(1, CHECK_SPRING));
        }));
        onChange(!checked);
      }}
      // La fila entera es táctil, no solo el cuadrito de 24px.
      hitSlop={{ top: space[2], bottom: space[2] }}
      style={[styles.root, disabled ? styles.disabled : null]}
    >
      <Animated.View style={[styles.box, checked ? styles.boxChecked : null, animatedStyle]}>
        {checked ? <Check size={15} color={colors.textOnBrand} strokeWidth={3.5} /> : null}
      </Animated.View>
      <View style={styles.label}>{label}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  disabled: {
    opacity: 0.5,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    // Alinea el cuadro con la primera línea del texto, no con el bloque entero.
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  label: {
    flex: 1,
  },
});
