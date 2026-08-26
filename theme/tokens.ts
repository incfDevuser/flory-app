/**
 * Tokens de Flory re-expresados para React Native.
 *
 * Fuente: FLORY-DESIGN-SYSTEM.md. Ese documento describe un bundle CSS/JSX de web
 * (`tokens/`, `components/`, `ui_kits/`) que NO existe en este repo y que no se puede
 * importar en RN. Aquí solo viven los valores que el layout necesita hoy: color,
 * espaciado, radios, sombras y movimiento. No es el sistema completo.
 *
 * Reglas duras que estos tokens codifican:
 *  - Nunca gris ni negro puro: todo neutro tiene verde dentro (§2.2).
 *  - La crema es el fondo de página; el blanco es la tarjeta, nunca al revés (§2.2).
 *  - Las sombras van teñidas de verde bosque, jamás de negro (§5).
 *  - Rojo existe pero es solo destructivo. El estado urgente es coral/ámbar (Flory.md §5).
 */

import { Platform, type ViewStyle } from 'react-native';

export const palette = {
  green50: '#EAF8F0',
  green100: '#D2F0E0',
  green200: '#A6E2C2',
  green300: '#6FD09E',
  green400: '#45C683',
  green500: '#2DBA6E',
  green600: '#22A05C',
  green700: '#1A7F49',
  green800: '#166238',
  green900: '#1C4B2E',

  lime100: '#EEFAD1',
  lime300: '#CBEF8C',
  lime400: '#A8E63A',
  lime500: '#95D22B',

  amber50: '#FFFAEC',
  amber100: '#FFF1D0',
  amber300: '#FFDF9C',
  amber400: '#FFD166',

  coral50: '#FFF1EC',
  coral400: '#F28C6B',

  /**
   * Rojo (§105). Derivado, no está en el manual de marca, y **solo para acciones
   * destructivas**: borrar la cuenta, perder datos de forma irreversible.
   *
   * Nunca para el estado de una planta. Una planta con sed no es un error del usuario,
   * y el rojo ahí dispara culpa (Flory.md:86). El urgente es coral.
   */
  red100: '#FCE0DA',
  red500: '#DE5238',

  violet50: '#F4F0FC',
  violet100: '#E7DEF8',
  violet500: '#7E57C2',

  cream0: '#FFFFFF',
  cream50: '#FFFCF4',
  cream100: '#FFF6E6',
  cream200: '#FBEDD6',
  cream300: '#F2E2C6',
  cream400: '#E6DCC6',

  ink900: '#1C4B2E',
  ink700: '#2F5F3F',
  ink500: '#5A7F67',
  ink400: '#87A594',
  ink300: '#AFC3B7',
} as const;

/** Alias semánticos — esto es lo que se usa en las pantallas, no `palette` directo (§2.3). */
export const colors = {
  bgPage: palette.cream100,
  bgPageAlt: palette.cream50,
  surfaceCard: palette.cream0,
  surfaceSunken: palette.cream200,
  surfaceBrand: palette.green500,
  surfaceBrandSoft: palette.green50,
  surfaceForest: palette.green900,

  textHeading: palette.green900,
  textBody: palette.ink700,
  textMuted: palette.ink500,
  textFaint: palette.ink400,
  textOnBrand: '#FFFFFF',
  textOnForest: palette.cream100,

  borderSubtle: palette.cream300,
  borderDefault: palette.cream400,
  borderStrong: palette.green200,
  borderFocus: palette.green500,
  /** Halo de foco (`--ring-focus`, §5). Va como sombra, no como borde: cambiar el
   *  ancho del borde en focus mueve el layout del campo. */
  focusRing: 'rgba(45,186,110,0.35)',

  actionPrimary: palette.green500,
  actionPrimaryHover: palette.green600,

  /** Estado de la planta. Coincide con el enum `plant_status` de Postgres. */
  statusBien: palette.green500,
  statusBienSoft: palette.green50,
  statusAtencion: palette.amber400,
  statusAtencionSoft: palette.amber100,
  statusUrgente: palette.coral400,
  statusUrgenteSoft: palette.coral50,

  /** Solo acciones irreversibles (§156). No es un estado de planta. */
  textDestructive: palette.red500,
  surfaceDestructiveSoft: palette.red100,

  /** Chrome traslúcido: solo para lo que flota sobre contenido (§5). */
  glassCream: 'rgba(255,246,230,0.72)',
} as const;

/** Escala base 4px (§4). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const layout = {
  /** Márgenes laterales de la app. */
  gutter: 20,
  /** Objetivo táctil mínimo del sistema. Android sube a 48 por Material. */
  tapMin: 48,
  cardPad: 20,
} as const;

/** Nada es recto (§5). */
export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  '2xl': 36,
  pill: 999,
} as const;

export const border = {
  width: 1.5,
  widthStrong: 2,
} as const;

/**
 * Sombras separadas por plataforma a propósito.
 * En Android las props `shadow*` no renderizan: solo `elevation` funciona, y no
 * admite color ni dirección. Por eso el chrome de cada plataforma usa la suya.
 */
export const shadow = {
  ios: {
    xs: {
      shadowColor: palette.green900,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    sm: {
      shadowColor: palette.green900,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
    },
    md: {
      shadowColor: palette.green900,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.09,
      shadowRadius: 18,
    },
    lg: {
      shadowColor: palette.green900,
      shadowOffset: { width: 0, height: -14 },
      shadowOpacity: 0.12,
      shadowRadius: 34,
    },
    xl: {
      shadowColor: palette.green900,
      shadowOffset: { width: 0, height: 26 },
      shadowOpacity: 0.16,
      shadowRadius: 60,
    },
    brand: {
      shadowColor: palette.green500,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
    },
  },
  android: {
    xs: { elevation: 1 },
    sm: { elevation: 2 },
    md: { elevation: 4 },
    lg: { elevation: 8 },
    xl: { elevation: 16 },
    brand: { elevation: 10 },
  },
} as const;

/**
 * Atajo por plataforma. Evita repetir el ternario en cada StyleSheet.
 *
 * Ternario y no `Platform.select`: `select` infiere el tipo de la primera rama, así
 * que con dos formas distintas (sombra iOS vs `elevation` Android) el tipo resultante
 * exigiría las claves de ambas a la vez.
 */
type ElevationSet = Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'brand', ViewStyle>;

export const elevation: ElevationSet = Platform.OS === 'android' ? shadow.android : shadow.ios;

/** §6. `spring` es «el pop de Flory»: la interacción más reconocible de la marca. */
export const motion = {
  duration: {
    instant: 90,
    fast: 160,
    base: 240,
    slow: 400,
  },
  /** Los valores cubic-bezier del doc, listos para `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0.8, 0.2, 1],
    outSoft: [0.16, 0.84, 0.44, 1],
    spring: [0.34, 1.56, 0.64, 1],
    inOut: [0.65, 0, 0.35, 1],
  },
  pressScale: 0.96,
} as const;

/**
 * Familias cargadas en `app/_layout.tsx` con `useFonts`.
 *
 * En React Native cada peso es una familia distinta: no existe el `font-weight`
 * sintético de la web. Por eso se elige familia, no peso. Mezclar `fontFamily`
 * con `fontWeight` en el mismo estilo hace que Android intente un bold falso
 * encima de una cara que ya es bold, y engorda el texto.
 */
export const fonts = {
  display: 'Baloo2_800ExtraBold',
  displayBold: 'Baloo2_700Bold',
  body: 'Nunito_400Regular',
  bodySemibold: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
} as const;

/**
 * Tipografía (§3). Cada token es un preset completo: familia, tamaño, interlínea
 * y tracking. Se usa con spread y **sin** añadir `fontWeight`.
 *
 * Tracking del doc: `-0.015em` en titulares, `0` en cuerpo, `0.02em` en botones.
 * Aquí va resuelto a px porque RN no entiende `em`.
 */
export const type = {
  // Titulares: siempre display, siempre tracking negativo (§213).
  h1: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -0.54 },
  h2: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.42 },
  h3: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.33 },
  h4: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.27 },

  // Cuerpo: nunca la display (§214).
  lg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  md: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26 },
  sm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  xs: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },

  /** La única mayúscula del sistema (§205). El `textTransform` lo pone quien lo use. */
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 16, letterSpacing: 1.04 },
  /** Etiqueta de botón: display 700 con tracking `0.02em` (§359). */
  button: { fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.32 },
  tabLabel: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14 },

  /**
   * @deprecated Quedan para las pantallas todavía sin rediseñar. En cuanto una
   * pantalla pase por el rediseño, se elige familia vía `fonts`, no peso.
   */
  weight: {
    regular: '400',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
} as const;
