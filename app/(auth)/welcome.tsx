import { router } from 'expo-router';
import { useWindowDimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloryMascot, FloryWordmark, MascotHalo } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { colors, layout, space, type as typography } from '@/theme/tokens';

/**
 * Lo primero que ve alguien que acaba de descargar. Tiene 3 segundos para comunicar
 * la promesa (FlorySpec §63).
 *
 * Decisiones que vienen del spec:
 *  - **Sin carrusel de 4 slides.** Quien descargó ya está convencido (§75).
 *  - **Sin scroll**: todo cabe en una pantalla (§76).
 *  - Una sola acción principal; «Ya tengo cuenta» es botón de texto, no un segundo
 *    primario (§16).
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // El héroe se adapta a la pantalla en vez de ser fijo. En un iPhone SE una mascota
  // de 260px empuja los botones fuera del viewport, y el spec pide que no haya scroll.
  const mascotHeight = Math.max(180, Math.min(268, height * 0.29));
  const haloSize = mascotHeight * 1.15;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] }]}>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(400)} style={styles.brandRow}>
        <FloryWordmark width={112} />
      </Animated.View>

      <View style={styles.hero}>
        <View style={styles.mascotWrap}>
          {/* El halo le da suelo: un PNG con alfa sobre la crema, sin fondo, se ve
              pegado en vez de puesto. */}
          <MascotHalo size={haloSize} style={styles.halo} />
          <Animated.View
            // El pop de entrada es el gesto más reconocible de la marca (§6). Se
            // desactiva si el sistema pide menos movimiento.
            entering={reduceMotion ? undefined : FadeInDown.springify().damping(13).mass(0.6).delay(80)}
          >
            <FloryMascot pose="saluda" height={mascotHeight} />
          </Animated.View>
        </View>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(420).delay(220)}
          style={styles.copy}
        >
          <Text style={styles.title}>Tu planta te habla</Text>
          <Text style={styles.lead}>
            Flory te dice qué necesita tu planta y cuándo, sin que tengas que adivinar.
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(420).delay(340)}
        style={styles.actions}
      >
        <Button label="Empezar" onPress={() => router.push('/sign-up')} />
        <Button label="Ya tengo cuenta" variant="ghost" onPress={() => router.push('/sign-in')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
    paddingHorizontal: layout.gutter,
  },
  brandRow: {
    alignItems: 'center',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: space[8],
  },
  mascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    // Baja el disco para que la mascota sobresalga por arriba en vez de quedar
    // centrada dentro del círculo, que la haría ver metida en un agujero.
    bottom: -12,
  },
  copy: {
    gap: space[3],
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.textHeading,
    textAlign: 'center',
  },
  lead: {
    ...typography.lg,
    color: colors.textBody,
    textAlign: 'center',
    // La bajada no debe llegar a los bordes: en 3 líneas cortas se lee mucho mejor
    // que en 2 que tocan el gutter.
    maxWidth: 320,
  },
  actions: {
    gap: space[2],
  },
});
