import { useMutation } from '@tanstack/react-query';
import { TriangleAlert, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, elevation, layout, radius, space, type as typography } from '@/theme/tokens';

/**
 * Borrado de cuenta en dos pasos (FlorySpec §396).
 *
 * Los dos pasos no son burocracia: el primero enumera lo que se pierde y el segundo
 * pide un toque deliberado. Una sola confirmación al lado de «Cerrar sesión» se toca
 * por accidente, y esto no tiene vuelta atrás.
 *
 * El tono es neutro y corporativo, no la voz de la planta (Flory.md). Que una planta
 * te hable con cariño mientras borras tus datos sería manipulador.
 */
export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
    },
    onSuccess: async () => {
      // El borrado hace cascade sobre plantas, riegos y diagnósticos, pero el JWT en
      // memoria sigue siendo válido hasta que expire: hay que cerrar sesión para que
      // el guard devuelva a (auth) en vez de dejar una sesión huérfana.
      await signOut();
    },
  });

  const close = () => {
    if (!remove.isPending) onClose();
  };

  return (
    <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.modal}>
        <Pressable accessibilityLabel="Cerrar" onPress={close} style={styles.backdrop} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <TriangleAlert size={22} color={colors.textDestructive} strokeWidth={2.2} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={close}
              disabled={remove.isPending}
              style={styles.close}
            >
              <X size={21} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>

          {confirming ? (
            <>
              <Text style={styles.title}>Esta acción no se puede deshacer</Text>
              <Text style={styles.body}>
                Al confirmar, tu cuenta y todos sus datos se eliminan de inmediato. No hay forma
                de recuperarlos después.
              </Text>

              {remove.isError ? (
                <Banner message="No se pudo eliminar la cuenta. Tus datos siguen intactos; inténtalo de nuevo en un momento." />
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="Eliminar definitivamente"
                  variant="outline"
                  loading={remove.isPending}
                  onPress={() => remove.mutate()}
                  style={styles.destructiveButton}
                />
                <Button
                  label="Cancelar"
                  variant="ghost"
                  disabled={remove.isPending}
                  onPress={close}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Eliminar cuenta</Text>
              <Text style={styles.body}>Se eliminará de forma permanente:</Text>

              <View style={styles.list}>
                <Bullet text="Tus plantas y todo lo que registraste de ellas" />
                <Bullet text="El historial de riegos y lo que Flory aprendió de tu casa" />
                <Bullet text="Tus diagnósticos y sus fotos" />
                <Bullet text="Tu cuenta y tu correo" />
              </View>

              <View style={styles.actions}>
                <Button label="Continuar" variant="outline" onPress={() => setConfirming(true)} />
                <Button label="Mejor no" variant="ghost" onPress={close} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.dot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,75,46,0.28)',
  },
  sheet: {
    paddingTop: space[3],
    paddingHorizontal: layout.gutter,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.bgPageAlt,
    ...elevation.lg,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    alignSelf: 'center',
    marginBottom: space[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[3],
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDestructiveSoft,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  title: {
    ...typography.h3,
    color: colors.textHeading,
  },
  body: {
    ...typography.md,
    color: colors.textMuted,
    marginTop: space[2],
  },
  list: {
    gap: space[2],
    marginTop: space[4],
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
    backgroundColor: colors.textDestructive,
  },
  bulletText: {
    ...typography.sm,
    flex: 1,
    color: colors.textBody,
  },
  actions: {
    gap: space[2],
    marginTop: space[6],
  },
  /**
   * Solo el borde va en rojo. Un botón relleno de rojo a ancho completo asusta más de
   * lo que informa, y el peso de la advertencia ya lo lleva el texto de arriba.
   */
  destructiveButton: {
    borderColor: colors.textDestructive,
  },
});
