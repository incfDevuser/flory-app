import { router, useLocalSearchParams } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthScaffold } from '@/components/auth/auth-scaffold';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { DividerO } from '@/components/ui/divider-o';
import { Field } from '@/components/ui/field';
import { PasswordField } from '@/components/ui/password-field';
import { SocialButtons } from '@/components/ui/social-buttons';
import { authError, type AuthErrorInfo } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, fonts, space, type as typography } from '@/theme/tokens';

export default function SignInScreen() {
  // sign-up manda aquí el correo ya escrito cuando la cuenta existe, para que el
  // usuario no lo teclee dos veces.
  const { email: prefilledEmail } = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(prefilledEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorInfo>();
  const [loading, setLoading] = useState(false);
  const offline = useOffline();

  // No se navega a mano al entrar: `Stack.Protected` en app/_layout.tsx reacciona al
  // cambio de sesión y cambia de grupo solo.
  async function signIn() {
    setLoading(true);
    setError(undefined);

    const { error: authFailure } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setError(authError(authFailure));
    setLoading(false);
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !offline;

  return (
    <AuthScaffold
      title="Hola de nuevo"
      subtitle="Entra para ver cómo están tus plantas."
      offline={offline}
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>¿No tienes cuenta? </Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-up')} hitSlop={8}>
            <Text style={styles.footerLink}>Regístrate</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.form}>
        <Field
          label="Correo"
          value={email}
          onChangeText={setEmail}
          placeholder="tu@correo.cl"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          inputMode="email"
          editable={!loading}
          // El campo se pinta, pero el mensaje va una sola vez bajo el formulario.
          error={error?.kind === 'invalid_credentials'}
          leadingIcon={<Mail size={18} color={colors.textFaint} strokeWidth={2.2} />}
        />

        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="Tu contraseña"
          autoComplete="current-password"
          editable={!loading}
          error={error?.kind === 'invalid_credentials'}
          onSubmitEditing={canSubmit ? signIn : undefined}
          returnKeyType="go"
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/forgot-password')}
          hitSlop={8}
          style={styles.forgot}
        >
          <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
      </View>

      {error ? <Banner tone="atencion" message={error.message} /> : null}

      <Button label="Entrar" onPress={signIn} loading={loading} disabled={!canSubmit} />

      <DividerO />

      <SocialButtons
        disabled={loading || offline}
        // TODO(auth-social): pendiente de expo-apple-authentication y del proveedor
        // OAuth en Supabase. Ver components/ui/social-buttons.tsx.
        onApple={() => {}}
        onGoogle={() => {}}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
  forgot: {
    // A la derecha, pegado al campo de contraseña con el que se relaciona (§89).
    alignSelf: 'flex-end',
  },
  forgotText: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.actionPrimaryHover,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  footerLink: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.actionPrimaryHover,
  },
});
