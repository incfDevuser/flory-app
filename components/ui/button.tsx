import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, elevation, motion, palette, radius, space, type as typography } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Corto y firme: el press tiene que sentirse instantáneo, no rebotar. El rebote de
// marca (`motion.easing.spring`) es para entradas, no para feedback táctil.
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.5 } as const;

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  /** Siempre empieza por verbo. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** 36 / 46 / 54 (§8.1). El primario de una pantalla normalmente es `lg`. */
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Se oculta mientras `loading`: ocupa el mismo sitio que el spinner. */
  leadingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Píldora con etiqueta en display 700 y press con spring (§8.1).
 *
 * Un solo `primary` por pantalla (FlorySpec §16). `secondary` es el relleno suave
 * para acciones de igual importancia pero menor urgencia; `outline` es para lo que
 * vive fuera de la marca, como el login social; `ghost` es texto puro.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  leadingIcon,
  style,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const isInert = disabled || loading;

  const sizeStyle = SIZES[size];
  const tone = TONES[variant];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInert, busy: loading }}
      disabled={isInert}
      onPressIn={() => scale.set(withSpring(motion.pressScale, PRESS_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_SPRING))}
      onPress={onPress}
      style={[
        styles.base,
        { height: sizeStyle.height, paddingHorizontal: sizeStyle.paddingHorizontal },
        tone.container,
        // La sombra de marca solo va bajo rellenos verdes (§5) y desaparece al
        // deshabilitar: un botón muerto que sigue flotando miente sobre su estado.
        variant === 'primary' && !isInert ? elevation.brand : null,
        isInert ? tone.inert : null,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.label.color} />
      ) : (
        <View style={styles.row}>
          {leadingIcon}
          <Text
            numberOfLines={1}
            style={[styles.label, { fontSize: sizeStyle.fontSize }, tone.label, isInert ? tone.inertLabel : null]}
          >
            {label}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const SIZES = {
  sm: { height: 36, paddingHorizontal: space[4], fontSize: 14 },
  md: { height: 46, paddingHorizontal: space[6] - 2, fontSize: 16 },
  lg: { height: 54, paddingHorizontal: space[8] - 4, fontSize: 18 },
} as const;

const TONES = {
  primary: {
    container: { backgroundColor: colors.actionPrimary },
    label: { color: colors.textOnBrand },
    // Deshabilitado aplana a crema sin sombra (§8.1).
    inert: { backgroundColor: palette.cream300 },
    inertLabel: { color: colors.textFaint },
  },
  secondary: {
    container: { backgroundColor: colors.surfaceBrandSoft },
    label: { color: colors.textHeading },
    inert: { backgroundColor: palette.cream200 },
    inertLabel: { color: colors.textFaint },
  },
  outline: {
    container: {
      backgroundColor: colors.surfaceCard,
      borderWidth: 1.5,
      borderColor: colors.borderDefault,
    },
    label: { color: colors.textHeading },
    inert: { opacity: 0.5 },
    inertLabel: null,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    label: { color: colors.textHeading },
    // Un botón de texto deshabilitado se atenúa; no se rellena. Rellenarlo de crema
    // lo convertía en un botón sólido roto.
    inert: { opacity: 0.45 },
    inertLabel: null,
  },
} as const;

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  label: {
    ...typography.button,
    // El preset trae 16/20; el tamaño real lo pisa `sizeStyle.fontSize`, así que la
    // interlínea se deja calcular sola para que no recorte a 18.
    lineHeight: undefined,
    textAlign: 'center',
    // Baloo 2 declara un font padding generoso. En Android eso descentra la etiqueta
    // dentro de la píldora; en iOS la prop se ignora.
    includeFontPadding: false,
  },
});
