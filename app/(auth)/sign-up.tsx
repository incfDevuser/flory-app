import { router } from 'expo-router';
import { Check, Mail, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthScaffold } from '@/components/auth/auth-scaffold';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DividerO } from '@/components/ui/divider-o';
import { Field } from '@/components/ui/field';
import { PasswordField } from '@/components/ui/password-field';
import { SocialButtons } from '@/components/ui/social-buttons';
import { appleAuthErrorMessage, signInWithApple } from '@/lib/apple-auth';
import { authError, type AuthErrorInfo } from '@/lib/auth-errors';
import { googleAuthErrorMessage, signInWithGoogle } from '@/lib/google-auth';
import { hasLegalLinks, openLegal } from '@/lib/links';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, fonts, space, type as typography } from '@/theme/tokens';

const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<AuthErrorInfo>();
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const offline = useOffline();

  const longEnough = password.length >= MIN_PASSWORD;

  async function signUp() {
    setLoading(true);
    setError(undefined);

    const trimmed = email.trim();
    const { data, error: authFailure } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: {
        // Solo presentacional. El trigger lo copia a profiles.display_name; nunca se
        // usa metadata editable por el usuario para permisos o RLS.
        data: { display_name: displayName.trim() },
      },
    });

    if (authFailure) {
      setError(authError(authFailure));
    } else if (!data.session) {
      // Sin sesión y sin error significa que el proyecto pide confirmar el correo.
      // Ahí no hay nada que hacer en esta pantalla: se pasa a la de verificación.
      router.replace({ pathname: '/verifica-correo', params: { email: trimmed } });
    }

    setLoading(false);
  }

  async function googleSignUp() {
    setGoogleLoading(true);
    setError(undefined);

    try {
      await signInWithGoogle();
    } catch (googleError) {
      setError({ kind: 'generic', message: googleAuthErrorMessage(googleError) });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function appleSignUp() {
    setAppleLoading(true);
    setError(undefined);

    try {
      await signInWithApple();
    } catch (appleError) {
      setError({ kind: 'generic', message: appleAuthErrorMessage(appleError) });
    } finally {
      setAppleLoading(false);
    }
  }

  const canSubmit =
    displayName.trim().length > 0 &&
    email.trim().length > 0 &&
    longEnough &&
    accepted &&
    !offline;
  const busy = loading || googleLoading || appleLoading;

  return (
    <AuthScaffold
      title="Creemos tu cuenta"
      subtitle="Con esto guardamos tus plantas y su historial."
      offline={offline}
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/sign-in')} hitSlop={8}>
            <Text style={styles.footerLink}>Entrar</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.form}>
        <Field
          label="Tu nombre"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Martina"
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={60}
          editable={!busy}
          leadingIcon={<UserRound size={18} color={colors.textFaint} strokeWidth={2.2} />}
        />

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
          editable={!busy}
          error={error?.kind === 'email_exists'}
          leadingIcon={<Mail size={18} color={colors.textFaint} strokeWidth={2.2} />}
        />

        <View style={styles.passwordBlock}>
          <PasswordField
            value={password}
            onChangeText={setPassword}
            placeholder="Crea una contraseña"
            autoComplete="new-password"
            editable={!busy}
          />
          {/* El requisito se ve ANTES de escribir, no como error después (§112).
              Solo se marca cuando se cumple; nunca se pinta en rojo al fallar. */}
          <Requirement met={longEnough} label={`Al menos ${MIN_PASSWORD} caracteres`} />
        </View>
      </View>

      {error ? (
        <Banner
          tone="atencion"
          message={error.message}
          // Si el correo ya existe, la salida es entrar con él, no volver a escribirlo (§120).
          action={
            error.kind === 'email_exists'
              ? {
                  label: 'Entrar con este correo',
                  onPress: () => router.replace({ pathname: '/sign-in', params: { email: email.trim() } }),
                }
              : undefined
          }
        />
      ) : null}

      <Checkbox
        checked={accepted}
        onChange={setAccepted}
        accessibilityLabel="Acepto los términos y la política de privacidad"
        label={
          <Text style={styles.legal}>
            Acepto los{' '}
            <Text
              style={hasLegalLinks() ? styles.legalLink : styles.legalPending}
              onPress={() => openLegal('terms')}
            >
              términos
            </Text>{' '}
            y la{' '}
            <Text
              style={hasLegalLinks() ? styles.legalLink : styles.legalPending}
              onPress={() => openLegal('privacy')}
            >
              política de privacidad
            </Text>
            .
          </Text>
        }
      />

      <Button
        label="Crear cuenta"
        onPress={signUp}
        loading={loading}
        disabled={!canSubmit || googleLoading || appleLoading}
      />

      <DividerO />

      <SocialButtons
        disabled={busy || offline || !accepted}
        googleLoading={googleLoading}
        appleLoading={appleLoading}
        onGoogle={googleSignUp}
        onApple={appleSignUp}
      />
    </AuthScaffold>
  );
}

/** Un requisito de contraseña. Neutro mientras no se cumple, verde cuando sí. */
function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.requirement}>
      <View style={[styles.requirementDot, met ? styles.requirementDotMet : null]}>
        {met ? <Check size={11} color={colors.textOnBrand} strokeWidth={3.5} /> : null}
      </View>
      <Text style={[styles.requirementText, met ? styles.requirementTextMet : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space[4],
  },
  passwordBlock: {
    gap: space[2],
  },
  requirement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[1],
  },
  requirementDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requirementDotMet: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  requirementText: {
    ...typography.xs,
    color: colors.textMuted,
  },
  requirementTextMet: {
    color: colors.actionPrimaryHover,
  },
  legal: {
    ...typography.sm,
    color: colors.textBody,
  },
  legalLink: {
    fontFamily: fonts.bodyBold,
    color: colors.actionPrimaryHover,
    textDecorationLine: 'underline',
  },
  legalPending: {
    // Sin URL todavía: se distingue del texto normal pero no simula ser un enlace
    // vivo. Ver el TODO(legal) en lib/links.ts.
    fontFamily: fonts.bodyBold,
    color: colors.textBody,
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
