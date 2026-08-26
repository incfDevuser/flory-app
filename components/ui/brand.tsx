import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Arte de marca. Los archivos vienen de `assets/brand/`, derivados de los originales:
 * recortados al contenido real y bajados al tamaño que la UI necesita. En particular
 * `logotipo.png` es la versión con alfa — el original `LogotipoFlory.png` viene sobre
 * blanco y sobre la crema de la página pintaría un rectángulo.
 *
 * Siempre `expo-image` con tamaño explícito: sin ancho y alto, un PNG de 840px
 * decide él solo cuánto ocupa.
 */

const ART = {
  logotipo: require('@/assets/brand/logotipo.png'),
  isotipo: require('@/assets/brand/isotipo.png'),
  saluda: require('@/assets/brand/mascota-saluda.png'),
  cara: require('@/assets/brand/mascota-cara.png'),
  regadera: require('@/assets/brand/mascota-regadera.png'),
  idea: require('@/assets/brand/mascota-idea.png'),
} as const;

/**
 * Proporción real de cada archivo, para no deformar nada.
 *
 * Son las de los archivos ya recortados al contenido visible. Importa que el recorte
 * sea real: mientras los PNG arrastraban aire transparente, pedir dos poses al mismo
 * alto las dibujaba de tamaños distintos, porque el aire sobrante variaba entre 11% y
 * 24% según el archivo.
 */
const RATIO = {
  logotipo: 640 / 327,
  isotipo: 1,
  saluda: 840 / 981,
  cara: 480 / 595,
  regadera: 840 / 946,
  idea: 840 / 1416,
} as const;

/** El logotipo «Flory». Se mide por ancho: es una palabra, no un icono. */
export function FloryWordmark({ width = 132, style }: { width?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={ART.logotipo}
      style={[{ width, height: width / RATIO.logotipo }, style]}
      contentFit="contain"
      accessibilityLabel="Flory"
      // El logo nunca cambia: cachearlo en memoria y disco evita el parpadeo al
      // volver a montar la pantalla.
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

/**
 * El isotipo. Cuadrado, se mide por lado.
 *
 * Sin `borderRadius`: la máscara de esquinas va horneada en el PNG. Redondear desde
 * aquí no servía porque el recuadro verde del arte no llega al borde del archivo, así
 * que el radio recortaba transparencia y la silueta seguía viéndose cuadrada.
 */
export function FloryMark({ size = 56, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={ART.isotipo}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      accessibilityLabel="Flory"
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

export type MascotPose = 'saluda' | 'cara' | 'regadera' | 'idea';

/**
 * La mascota. Se mide por **alto**, porque las cuatro poses tienen anchos muy
 * distintos y lo que hay que mantener constante entre pantallas es cuánto ocupa
 * verticalmente.
 */
export function FloryMascot({
  pose,
  height,
  style,
}: {
  pose: MascotPose;
  height: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={ART[pose]}
      style={[{ height, width: height * RATIO[pose] }, style]}
      contentFit="contain"
      // Decorativa: el mensaje siempre está en el texto de al lado. Anunciarla sería
      // repetir lo mismo dos veces al lector de pantalla.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

/**
 * Disco de color suave que va detrás de la mascota. Sin él, un PNG con alfa sobre la
 * crema se ve pegoteado, sin suelo.
 */
export function MascotHalo({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

const styles = StyleSheet.create({
  halo: {
    backgroundColor: colors.surfaceBrandSoft,
  },
});
