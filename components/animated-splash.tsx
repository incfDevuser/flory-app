import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { FloryWordmark } from '@/components/ui/brand';
import { colors } from '@/theme/tokens';

const SPRING = { damping: 13, stiffness: 150, mass: 0.7 } as const;

/**
 * Splash animado. Cubre la app con la crema de marca (el mismo fondo que el splash nativo,
 * así el paso es sin costura y nunca en negro) y anima el logotipo «Flory»: aparece con un
 * pop suave, se sostiene un instante, y todo se disuelve para revelar la app.
 *
 * Oculta el splash NATIVO recién al montarse (ya pintó la crema encima), para que no haya
 * un frame de la app antes de la animación.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const overlay = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.86);
  const logoShift = useSharedValue(10);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    logoOpacity.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    logoScale.set(withSpring(1, SPRING));
    logoShift.set(withSpring(0, SPRING));

    // Tras sostener el logo, disolver todo el overlay y avisar para desmontarlo.
    overlay.set(
      withDelay(
        780,
        withTiming(0, { duration: 340, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onFinish)();
        }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.get() }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.get(),
    transform: [{ scale: logoScale.get() }, { translateY: logoShift.get() }],
  }));

  // `pointerEvents="auto"`: mientras cubre la app, se traga los toques (que no lleguen a
  // una pantalla que aún no se ve). Se desmonta al terminar la animación.
  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="auto">
      <Animated.View style={logoStyle}>
        <FloryWordmark width={196} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
