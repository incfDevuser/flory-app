import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/ui/button';
import { palette, space } from '@/theme/tokens';

/**
 * Login social (FlorySpec §92-93).
 *
 * TODO(auth-social): hoy solo es la interfaz. Cablearlo pide
 *   - Apple: `expo-apple-authentication` + `expo-crypto` para el nonce, y
 *     `supabase.auth.signInWithIdToken`. No corre en Expo Go: necesita dev build.
 *   - Google: proveedor OAuth configurado en Supabase + `expo-web-browser`.
 *
 * Reglas que hay que respetar al cablearlo:
 *   - Apple solo se ofrece en iOS. En Android no existe el botón.
 *   - Si en iOS hay cualquier login social de terceros, Apple pasa a ser
 *     **obligatorio** para App Store. Por eso van juntos o no va ninguno.
 *   - Las HIG de Apple fijan el estilo del botón y las cadenas admitidas. Aquí se usa
 *     el copy del spec; al cablearlo hay que revisarlo contra la guía vigente.
 */

/** Glifo oficial de Apple, monocromo, hereda el color que se le pase. */
function AppleGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

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
  onApple: () => void;
  onGoogle: () => void;
  disabled?: boolean;
};

export function SocialButtons({ onApple, onGoogle, disabled = false }: SocialButtonsProps) {
  return (
    <View style={styles.stack}>
      {/* Apple no existe fuera de iOS: mostrarlo en Android sería un botón que no
          puede funcionar nunca. */}
      {Platform.OS === 'ios' ? (
        <Button
          label="Continuar con Apple"
          variant="outline"
          size="md"
          disabled={disabled}
          onPress={onApple}
          leadingIcon={<AppleGlyph color={palette.ink900} />}
        />
      ) : null}

      <Button
        label="Continuar con Google"
        variant="outline"
        size="md"
        disabled={disabled}
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
});
