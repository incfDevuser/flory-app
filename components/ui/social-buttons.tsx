import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/ui/button';
import { radius, space } from '@/theme/tokens';

/**
 * Login social (FlorySpec §92-93).
 *
 * Ambos proveedores entregan su ID token nativo a Supabase. Apple se muestra solo
 * cuando el dispositivo confirma que el servicio está disponible.
 *
 * Reglas que hay que respetar al cablearlo:
 *   - Apple solo se ofrece en iOS. En Android no existe el botón.
 *   - Si en iOS hay cualquier login social de terceros, Apple pasa a ser
 *     **obligatorio** para App Store. Por eso van juntos o no va ninguno.
 *   - Las HIG de Apple exigen `AppleAuthenticationButton`; no se recrea con iconos.
 */

/** La G de Google va siempre a cuatro colores: es requisito de su marca. */
function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55z"
      />
      <Path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5z"
      />
      <Path fill="#FBBC05" d="M5.55 14.17a6.9 6.9 0 0 1 0-4.41V6.78H1.7a11.5 11.5 0 0 0 0 10.37l3.85-2.98z" />
      <Path
        fill="#EA4335"
        d="M12 5.01c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.55 15.1.5 12 .5A11.5 11.5 0 0 0 1.7 6.78l3.85 2.98C6.46 7.04 9 5.01 12 5.01z"
      />
    </Svg>
  );
}

type SocialButtonsProps = {
  onApple?: () => void;
  onGoogle: () => void;
  disabled?: boolean;
  googleLoading?: boolean;
  appleLoading?: boolean;
};

export function SocialButtons({
  onApple,
  onGoogle,
  disabled = false,
  googleLoading = false,
  appleLoading = false,
}: SocialButtonsProps) {
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let active = true;

    if (Platform.OS !== 'ios' || !onApple) return;

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {
        if (active) setAppleAvailable(false);
      });

    return () => {
      active = false;
    };
  }, [onApple]);

  const appleInert = disabled || appleLoading;

  return (
    <View style={styles.stack}>
      {/* Apple no existe fuera de iOS: mostrarlo en Android sería un botón que no
          puede funcionar nunca. */}
      {appleAvailable && onApple ? (
        <View
          accessibilityState={{ disabled: appleInert, busy: appleLoading }}
          pointerEvents={appleInert ? 'none' : 'auto'}
        >
          <AppleAuthentication.AppleAuthenticationButton
            accessibilityLabel="Continuar con Apple"
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
            cornerRadius={radius.pill}
            onPress={onApple}
            style={styles.appleButton}
          />
        </View>
      ) : null}

      <Button
        label="Continuar con Google"
        variant="outline"
        size="md"
        disabled={disabled}
        loading={googleLoading}
        onPress={onGoogle}
        leadingIcon={<GoogleGlyph />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[3],
  },
  appleButton: {
    width: '100%',
    height: 46,
  },
});
