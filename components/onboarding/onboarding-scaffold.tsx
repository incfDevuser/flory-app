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
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloryWordmark } from '@/components/ui/brand';
import { colors, elevation, layout, space, type as typography } from '@/theme/tokens';

type OnboardingScaffoldProps = {
  step: 1 | 2 | 3;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  onBack?: () => void;
  /**
   * `modal` quita el logotipo y el inset superior propios.
   *
   * Dentro de `plant/nueva` el header nativo del stack ya pone título y safe area, así
   * que la barra de bienvenida sobraría — y el spec §455 pide reutilizar los tres pasos
   * justamente «sin la barra de bienvenida».
   */
  variant?: 'onboarding' | 'modal';
};

/** Safe area, progreso, teclado y CTA fijo compartidos por los tres pasos. */
export function OnboardingScaffold({
  step,
  title,
  description,
  children,
  footer,
  onBack = () => router.back(),
  variant = 'onboarding',
}: OnboardingScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {variant === 'onboarding' ? (
        <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Atrás"
            hitSlop={space[3]}
            onPress={onBack}
            style={styles.headerSide}
          >
            <ChevronLeft size={24} color={colors.textHeading} strokeWidth={2.4} />
          </Pressable>
          <FloryWordmark width={86} />
          <View style={styles.headerSide} />
        </View>
      ) : null}

      <View style={styles.progressBlock}>
        <Text style={styles.stepLabel}>Paso {step} de 3</Text>
        <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step }}>
          {[1, 2, 3].map((part) => (
            <Animated.View
              key={part}
              layout={LinearTransition.duration(180)}
              style={[styles.progressPart, part <= step ? styles.progressPartActive : null]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(300)} style={styles.intro}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </Animated.View>
        {children}
      </ScrollView>

      <View
        style={[
          styles.footer,
          elevation.lg,
          // `presentation: 'modal'` no es una hoja desprendida: en Android edge-to-edge el
          // borde inferior es el del teléfono y en iPhone queda sobre el home indicator. Hay
          // que respetar el inset con un piso mínimo para que el botón no toque el borde.
          { paddingBottom: Math.max(insets.bottom, space[1]) + space[3] },
        ]}
      >
        {footer}
      </View>
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
  headerSide: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  progressBlock: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    gap: space[2],
  },
  stepLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: space[2],
  },
  progressPart: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderSubtle,
  },
  progressPartActive: {
    backgroundColor: colors.actionPrimary,
  },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[8],
    paddingBottom: space[10],
    gap: space[6],
  },
  intro: {
    gap: space[2],
  },
  title: {
    ...typography.h1,
    color: colors.textHeading,
  },
  description: {
    ...typography.md,
    color: colors.textBody,
    maxWidth: 340,
  },
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[4],
    backgroundColor: colors.bgPageAlt,
    borderTopWidth: 1.5,
    borderTopColor: colors.borderSubtle,
  },
});
