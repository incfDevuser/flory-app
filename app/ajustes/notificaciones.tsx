import { Droplets, Leaf, Minus, Plus, Stethoscope } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Screen } from '@/components/screen';
import { hasNotificationPermission, registerForPushNotifications } from '@/lib/push';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space, type as typography } from '@/theme/tokens';

/**
 * Avisos: `profiles.push_enabled` y `profiles.push_hour`. Guardan al instante, sin botón
 * «Guardar» (design system §8.2). El envío real lo hace el job del servidor; aquí solo se
 * fija la preferencia y se registra el token/permiso del dispositivo.
 */
export default function AjustesNotificacionesScreen() {
  const { profile, userId, refreshProfile } = useSession();

  const [enabled, setEnabled] = useState(profile?.push_enabled ?? true);
  const [hour, setHour] = useState(profile?.push_hour ?? 9);
  const [osDenied, setOsDenied] = useState(false);

  // Traer el estado real cuando llega/cambia el profile.
  useEffect(() => {
    if (typeof profile?.push_enabled === 'boolean') setEnabled(profile.push_enabled);
    if (typeof profile?.push_hour === 'number') setHour(profile.push_hour);
  }, [profile?.push_enabled, profile?.push_hour]);

  // Reflejar si el SO tiene los avisos denegados (aunque la preferencia esté en «sí»).
  useEffect(() => {
    let active = true;
    void hasNotificationPermission().then((granted) => {
      if (active) setOsDenied(!granted);
    });
    return () => {
      active = false;
    };
  }, []);

  async function persist(patch: { push_enabled?: boolean; push_hour?: number }) {
    if (!userId) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
    await refreshProfile();
  }

  async function onToggle(next: boolean) {
    // Optimista: el switch responde al instante; si algo falla, se revierte.
    setEnabled(next);
    try {
      if (next && userId) {
        // Aquí SÍ se pide el permiso al SO (el usuario lo activó a propósito).
        await registerForPushNotifications(userId, { prompt: true });
        setOsDenied(!(await hasNotificationPermission()));
      }
      await persist({ push_enabled: next });
    } catch {
      setEnabled(!next);
    }
  }

  function onChangeHour(delta: number) {
    const next = Math.min(23, Math.max(0, hour + delta));
    if (next === hour) return;
    setHour(next);
    void persist({ push_hour: next }).catch(() => setHour(hour));
  }

  return (
    <Screen
      title="Avisos"
      description="Te escribo solo cuando hace falta, con la voz de tu planta."
    >
      <View style={styles.stack}>
        {enabled && osDenied ? (
          <Banner
            tone="atencion"
            message="Tienes los avisos desactivados en el sistema. Actívalos para recibirlos."
            action={{ label: 'Abrir Ajustes', onPress: () => void Linking.openSettings() }}
          />
        ) : null}

        {/* Interruptor maestro */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.rowLabel}>Recibir avisos</Text>
              <Text style={styles.rowNote}>Recordatorios de tus plantas</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ true: colors.actionPrimary, false: colors.borderDefault }}
              thumbColor={colors.surfaceCard}
              ios_backgroundColor={colors.borderDefault}
            />
          </View>
        </View>

        {/* Hora */}
        <View style={[styles.card, !enabled && styles.cardDisabled]}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.rowLabel}>Hora del día</Text>
              <Text style={styles.rowNote}>Te escribo alrededor de esta hora</Text>
            </View>
            <View style={styles.stepper}>
              <StepButton icon={<Minus size={18} color={colors.textHeading} strokeWidth={2.4} />} disabled={!enabled} onPress={() => onChangeHour(-1)} />
              <Text style={styles.hour}>{formatHour(hour)}</Text>
              <StepButton icon={<Plus size={18} color={colors.textHeading} strokeWidth={2.4} />} disabled={!enabled} onPress={() => onChangeHour(1)} />
            </View>
          </View>
        </View>

        {/* Qué te aviso */}
        <Text style={styles.sectionTitle}>Qué te aviso</Text>
        <View style={[styles.card, !enabled && styles.cardDisabled]}>
          <TypeRow
            icon={<Droplets size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            title="Riego"
            note="Cuando llega el momento de regar."
          />
          <View style={styles.divider} />
          <TypeRow
            icon={<Leaf size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            title="Revisar la planta"
            note="Un vistazo para ver cómo va."
          />
          <View style={styles.divider} />
          <TypeRow
            icon={<Stethoscope size={19} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            title="Diagnósticos"
            note="Seguimiento de un problema detectado."
          />
        </View>
      </View>
    </Screen>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, pressed && !disabled && styles.stepButtonPressed]}
    >
      {icon}
    </Pressable>
  );
}

function TypeRow({ icon, title, note }: { icon: React.ReactNode; title: string; note: string }) {
  return (
    <View style={styles.typeRow}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.switchCopy}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowNote}>{note}</Text>
      </View>
    </View>
  );
}

/** 24h, como en Chile. 9 → "9:00", 21 → "21:00". */
function formatHour(hour: number): string {
  return `${hour}:00`;
}

const styles = StyleSheet.create({
  stack: {
    gap: space[4],
    paddingTop: space[4],
  },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  switchRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  switchCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    ...typography.md,
    fontFamily: fonts.bodySemibold,
    color: colors.textHeading,
  },
  rowNote: {
    ...typography.xs,
    color: colors.textMuted,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  stepButtonPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  hour: {
    ...typography.md,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    minWidth: 52,
    textAlign: 'center',
  },
  sectionTitle: {
    ...typography.eyebrow,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: space[1],
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  divider: {
    height: 1.5,
    marginLeft: space[4] + 38 + space[3],
    backgroundColor: colors.borderSubtle,
  },
});
