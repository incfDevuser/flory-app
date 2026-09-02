import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Bell,
  CircleHelp,
  FileText,
  LogOut,
  Shield,
  Sprout,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeleteAccountSheet } from '@/components/perfil/delete-account-sheet';
import { ListRow } from '@/components/ui/list-row';
import { openLegal } from '@/lib/links';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import {
  colors,
  fonts,
  layout,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

export default function PerfilScreen() {
  const { profile, userId, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const plantCount = useQuery({
    queryKey: queryKeys.plantCount(userId ?? 'anon'),
    enabled: userId !== null,
    queryFn: async () => {
      // `head: true` no trae filas: solo pide el conteo por cabecera.
      const { count, error } = await supabase
        .from('plants')
        .select('id', { count: 'exact', head: true })
        .eq('archived', false);

      if (error) throw error;
      return count ?? 0;
    },
  });

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Quieres cerrar tu sesión en este dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
          } catch {
            Alert.alert('No se pudo cerrar la sesión', 'Inténtalo de nuevo en un momento.');
            setIsSigningOut(false);
          }
        },
      },
    ]);
  };

  const displayName = profile?.display_name?.trim();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: tabBarHeight + space[8] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{getInitial(displayName, profile?.email)}</Text>
          </View>
          <Text style={styles.name}>{displayName || 'Tu cuenta'}</Text>
          {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        </View>

        <Section title="Tu jardín">
          <ListRow
            label="Mis plantas"
            icon={<Sprout size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            value={plantCount.data === undefined ? undefined : String(plantCount.data)}
            onPress={() => router.navigate('/plantas')}
          />
        </Section>

        <Section title="Ajustes">
          <ListRow
            label="Notificaciones"
            note="Riego, revisiones y diagnósticos"
            icon={<Bell size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            onPress={() => router.navigate('/ajustes/notificaciones')}
          />
          <Divider />
          <ListRow
            label="Ayuda y contacto"
            note="@somosflory"
            icon={<CircleHelp size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            onPress={() => {
              void Linking.openURL('https://www.instagram.com/somosflory/').catch(() => {
                Alert.alert('No se pudo abrir Instagram', 'Inténtalo de nuevo en un momento.');
              });
            }}
          />
        </Section>

        <Section title="Legal">
          <ListRow
            label="Términos y condiciones"
            icon={<FileText size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            onPress={() => openLegal('terms')}
          />
          <Divider />
          <ListRow
            label="Política de privacidad"
            icon={<Shield size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            onPress={() => openLegal('privacy')}
          />
        </Section>

        <Section title="Cuenta">
          <ListRow
            label={isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            icon={<LogOut size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            onPress={handleSignOut}
            disabled={isSigningOut}
          />
          <Divider />
          <ListRow
            label="Eliminar cuenta"
            tone="destructive"
            icon={<Trash2 size={19} color={colors.textDestructive} strokeWidth={2.2} />}
            onPress={() => setDeleting(true)}
          />
        </Section>
      </ScrollView>

      {deleting ? <DeleteAccountSheet onClose={() => setDeleting(false)} /> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function getInitial(displayName?: string, email?: string | null): string {
  const source = displayName || email || '';
  const trimmed = source.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0].toUpperCase();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    paddingHorizontal: layout.gutter,
    gap: space[6],
  },
  identity: {
    alignItems: 'center',
    gap: space[2],
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  /**
   * Una sola letra centrada no puede heredar un preset de titular.
   *
   * `type.h1` trae `lineHeight: 40` sobre 36px y `letterSpacing: -0.54`: el interlineado
   * mayor que el cuerpo descuadra el glifo en vertical, y el tracking negativo se aplica
   * también después del último carácter, así que corre el centro óptico a la izquierda.
   * Con una sola letra ambos efectos se ven de inmediato.
   */
  avatarInitial: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: undefined,
    letterSpacing: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: colors.textHeading,
  },
  name: {
    ...typography.h3,
    color: colors.textHeading,
    textAlign: 'center',
  },
  email: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  section: {
    gap: space[2],
  },
  sectionTitle: {
    ...typography.eyebrow,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: space[1],
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
  },
  divider: {
    height: 1.5,
    marginLeft: space[4] + 38 + space[3],
    backgroundColor: colors.borderSubtle,
  },
});
