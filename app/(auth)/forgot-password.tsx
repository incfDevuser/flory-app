import { router } from 'expo-router';
import { Mail, MailCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { AuthScaffold } from '@/components/auth/auth-scaffold';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { authError, type AuthErrorInfo } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, fonts, radius, space, type as typography } from '@/theme/tokens';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<AuthErrorInfo>();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const offline = useOffline();
  const reduceMotion = useReducedMotion();

  async function sendLink() {
    setLoading(true);
    setError(undefined);

    const { error: authFailure } = await supabase.auth.resetPasswordForEmail(email.trim());

    // Solo se muestra el error si es de servicio o de formato. Si el correo
    // sencillamente no tiene cuenta, Supabase responde OK y aquí se confirma igual:
    // decir «ese correo no está registrado» permite enumerar usuarios (§136).
    if (authFailure) setError(authError(authFailure));
    else setSent(true);

    setLoading(false);
  }

  // Confirmación: misma pantalla, contenido reemplazado (§134). Empujar una ruta
  // nueva dejaría un back que vuelve a un formulario ya enviado.
  if (sent) {
    return (
      <AuthScaffold title="Revisa tu correo" canGoBack={false}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(280)} style={styles.done}>
          <View style={styles.doneIcon}>
            <MailCheck size={30} color={colors.actionPrimaryHover} strokeWidth={2.2} />
          </View>
          <Text style={styles.doneText}>
            Si <Text style={styles.email}>{email.trim()}</Text> tiene una cuenta, el enlace para crear una
            contraseña nueva ya va en camino.
          </Text>
        </Animated.View>

        <Button label="Volver a entrar" onPress={() => router.replace('/sign-in')} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="Recuperar contraseña"
      subtitle="Te enviaremos un enlace para crear una nueva."
      offline={offline}
    >
      <Animated.View exiting={reduceMotion ? undefined : FadeOut.duration(140)}>
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
          error={error !== undefined}
          leadingIcon={<Mail size={18} color={colors.textFaint} strokeWidth={2.2} />}
          onSubmitEditing={sendLink}
          returnKeyType="send"
        />
      </Animated.View>

      {error ? <Banner tone="atencion" message={error.message} /> : null}

      <Button
        label="Enviar enlace"
        onPress={sendLink}
        loading={loading}
        disabled={email.trim().length === 0 || offline}
      />

      {/* TODO(reset-password): falta la pantalla de «elegir contraseña nueva». Tiene
          que capturar el deep link de recuperación (scheme `floryapp`) con
          expo-linking y llamar a supabase.auth.updateUser. */}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  done: {
    alignItems: 'center',
    gap: space[5],
    paddingVertical: space[6],
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    ...typography.md,
    color: colors.textBody,
    textAlign: 'center',
    maxWidth: 320,
  },
  email: {
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
});
