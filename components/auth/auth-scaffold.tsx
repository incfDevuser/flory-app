import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { FloryWordmark } from '@/components/ui/brand';
import { colors, layout, space, type as typography } from '@/theme/tokens';

type AuthScaffoldProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pie fijo: el enlace «¿No tienes cuenta? Regístrate». */
  footer?: ReactNode;
  offline?: boolean;
  /** Oculta el botón de volver donde no hay a dónde volver. */
  canGoBack?: boolean;
  /** El isotipo se oculta en pantallas que ya traen mascota. */
  showMark?: boolean;
};

/**
 * Andamio común de las cuatro pantallas de formulario de auth.
 *
 * Existe porque `components/screen.tsx` no sirve aquí: no maneja teclado ni tiene pie.
 * Resuelve de una vez las tres cosas que se olvidan pantalla por pantalla:
 *   1. que el teclado no tape el botón primario (FlorySpec §102),
 *   2. safe area arriba y abajo (§24),
 *   3. el banner de sin conexión, que el spec pide en todas (§22).
 *
 * El título va **dentro** de la pantalla, no en el header nativo: con el header el
 * título queda a 17px centrado y pierde toda la jerarquía que le da el spec.
 */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
  offline = false,
  canGoBack = true,
  showMark = true,
}: AuthScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      // En Android `edgeToEdgeEnabled` ya hace que la ventana se redimensione sola;
      // añadir `padding` encima levanta el contenido el doble de lo que debe.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            hitSlop={space[3]}
            style={styles.back}
          >
            <ChevronLeft size={24} color={colors.textHeading} strokeWidth={2.4} />
          </Pressable>
        ) : (
          // Placeholder del mismo ancho: sin él, el isotipo se descoloca entre
          // pantallas con y sin botón de volver.
          <View style={styles.back} />
        )}

        {showMark ? <FloryWordmark width={88} /> : null}

        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[6] }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(320).delay(40)} style={styles.intro}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </Animated.View>

        {offline ? (
          <Banner tone="offline" message="Sin conexión. Revisa tu red para continuar." />
        ) : null}

        {children}
      </ScrollView>

      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[4],
    gap: space[5],
  },
  intro: {
    gap: space[2],
  },
  title: {
    ...typography.h1,
    color: colors.textHeading,
  },
  subtitle: {
    ...typography.lg,
    color: colors.textBody,
  },
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.bgPage,
  },
});
