import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { FloryMascot, MascotHalo } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { authError, type AuthErrorInfo } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, fonts, layout, space, type as typography } from '@/theme/tokens';

const COOLDOWN_SECONDS = 60;

/**
 * Paso intermedio cuando el proyecto exige confirmar el correo (FlorySpec §121).
 *
 * No hay botón de «continuar»: en cuanto el usuario abre el enlace, Supabase crea la
 * sesión, `onAuthStateChange` la propaga y el guard de `app/_layout.tsx` saca solo de
 * este grupo. Esta pantalla únicamente espera y permite reenviar.
 */
export default function VerificaCorreoScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const offline = useOffline();

  // Arranca en cooldown: el primer correo se acaba de enviar en sign-up, así que
  // ofrecer «reenviar» de inmediato solo consigue que lo pulsen y choquen con el
  // rate limit de Supabase.
  //
  // El cooldown se guarda como instante de vencimiento, no como contador que se
  // decrementa. Un `setInterval` que resta de uno en uno se congela mientras la app
  // está en segundo plano, que es exactamente donde va a estar el usuario: en su
  // cliente de correo. Al volver mostraría 47s cuando ya pasaron dos minutos.
  const [deadline, setDeadline] = useState(() => Date.now() + COOLDOWN_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<AuthErrorInfo>();
  const [resent, setResent] = useState(false);

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  const waiting = secondsLeft > 0;

  useEffect(() => {
    if (!waiting) return;
    // Medio segundo: el contador nunca se salta un número visible aunque el tick
    // llegue tarde.
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waiting]);

  async function resend() {
    if (!email) return;
    setSending(true);
    setError(undefined);
    setResent(false);

    const { error: authFailure } = await supabase.auth.resend({ type: 'signup', email });

    if (authFailure) {
      setError(authError(authFailure));
    } else {
      setResent(true);
      setDeadline(Date.now() + COOLDOWN_SECONDS * 1000);
      setNow(Date.now());
    }
    setSending(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[10], paddingBottom: insets.bottom + space[6] }]}>
      <View style={styles.hero}>
        <View style={styles.mascotWrap}>
          <MascotHalo size={200} style={styles.halo} />
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(360)}>
            <FloryMascot pose="cara" height={168} />
          </Animated.View>
        </View>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(400).delay(120)}
          style={styles.copy}
        >
          <Text style={styles.title}>Revisa tu correo</Text>
          <Text style={styles.lead}>
            Te enviamos un enlace a{' '}
            {/* El correo va destacado: es el dato que el usuario necesita verificar
                de un vistazo si se equivocó al escribirlo. */}
            <Text style={styles.email}>{email ?? 'tu correo'}</Text>. Ábrelo para continuar.
          </Text>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        {error ? <Banner tone="atencion" message={error.message} /> : null}
        {resent && !error ? <Banner tone="info" message="Listo, te enviamos otro enlace." /> : null}

        <Button
          // El contador vive en la etiqueta: un botón deshabilitado sin explicación
          // se lee como app rota.
          label={waiting ? `Reenviar en ${secondsLeft}s` : 'Reenviar enlace'}
          onPress={resend}
          loading={sending}
          disabled={waiting || offline || !email}
        />
        <Button label="Usar otro correo" variant="ghost" onPress={() => router.replace('/sign-up')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
    paddingHorizontal: layout.gutter,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
  },
  mascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    bottom: -8,
  },
  copy: {
    gap: space[3],
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.textHeading,
    textAlign: 'center',
  },
  lead: {
    ...typography.md,
    color: colors.textBody,
    textAlign: 'center',
    maxWidth: 320,
  },
  email: {
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  actions: {
    gap: space[2],
  },
});
