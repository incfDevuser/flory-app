import { CloudOff, Info, TriangleAlert } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { colors, fonts, palette, radius, space, type as typography } from '@/theme/tokens';

export type BannerTone = 'info' | 'atencion' | 'offline';

type BannerProps = {
  tone?: BannerTone;
  message: string;
  /** Acción inline. Se usa para «ya hay una cuenta con este correo → Entrar». */
  action?: { label: string; onPress: () => void };
  icon?: ReactNode;
};

const TONES = {
  info: {
    background: colors.surfaceBrandSoft,
    border: palette.green200,
    icon: Info,
    iconColor: colors.actionPrimaryHover,
  },
  atencion: {
    background: colors.statusAtencionSoft,
    border: colors.statusAtencion,
    icon: TriangleAlert,
    iconColor: palette.ink700,
  },
  offline: {
    background: colors.surfaceSunken,
    border: colors.borderDefault,
    icon: CloudOff,
    iconColor: colors.textMuted,
  },
} as const;

/**
 * Banner informativo (FlorySpec §51). Cubre error de formulario, aviso y estado sin
 * conexión.
 *
 * **Nunca rojo.** El tono de error es ámbar (§18): el rojo dispara culpa y en auth el
 * usuario ya llega frustrado por no acordarse de su contraseña.
 */
export function Banner({ tone = 'atencion', message, action, icon }: BannerProps) {
  const config = TONES[tone];
  const Icon = config.icon;

  return (
    <Animated.View
      // El banner aparece y desaparece según el estado del formulario. Sin la
      // transición, el contenido de abajo salta 60px de golpe.
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.root, { backgroundColor: config.background, borderColor: config.border }]}
    >
      {icon ?? <Icon size={18} color={config.iconColor} strokeWidth={2.2} />}

      <View style={styles.body}>
        <Text style={styles.message}>{message}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  body: {
    flex: 1,
    gap: space[1],
  },
  message: {
    ...typography.sm,
    color: colors.textBody,
  },
  action: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.actionPrimaryHover,
    textDecorationLine: 'underline',
  },
});
