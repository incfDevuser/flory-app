import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ChevronRight,
  CircleAlert,
  CloudOff,
  Droplets,
  Lock,
  Plus,
  RefreshCw,
  Sprout,
} from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { FloryMascot, type MascotPose } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { useHomePlants, type HomePlant } from '@/lib/home-plants';
import { useSignedPhotoUrl } from '@/lib/plant-photo';
import { STATUS_TONE, type PlantStatus } from '@/lib/plant-vocab';
import { useSession } from '@/lib/session';
import { useOffline } from '@/lib/use-offline';
import { wateringLabel } from '@/lib/watering-copy';
import {
  colors,
  elevation,
  fonts,
  layout,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

const STATUS_PRESENTATION: Record<PlantStatus, { label: string; pose: MascotPose }> = {
  urgente: { label: 'Creo que tengo sed', pose: 'regadera' },
  atencion: { label: 'Mi riego se acerca', pose: 'idea' },
  bien: { label: 'Estoy bien por aquí', pose: 'saluda' },
};

/**
 * El orden es por urgencia y no por fecha de creación (FlorySpec §325).
 *
 * Ordenar por antigüedad esconde justamente lo que hay que hacer hoy: la planta con sed
 * podría quedar al final de la lista solo por haber llegado después.
 */
const STATUS_WEIGHT: Record<PlantStatus, number> = {
  urgente: 0,
  atencion: 1,
  bien: 2,
};

export default function PlantasScreen() {
  const { userId } = useSession();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { plants, isLoading, isError, isFromCache, isFetching, refetch } = useHomePlants(
    userId,
    offline
  );

  const ordered = [...plants].sort(compareByUrgency);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space[6] }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Mis plantas</Text>
          {plants.length > 0 ? (
            <Text style={styles.subtitle}>
              {plants.length} {plants.length === 1 ? 'planta' : 'plantas'}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar planta"
          onPress={() => router.push('/plant/nueva')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Plus size={22} color={colors.textOnBrand} strokeWidth={2.6} />
        </Pressable>
      </View>

      {offline || isFromCache ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="offline"
            icon={<CloudOff size={18} color={colors.textMuted} strokeWidth={2.2} />}
            message="Estás sin conexión. Te muestro la última información que guardé."
          />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.skeleton}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.skeletonRow} />
          ))}
        </View>
      ) : isError ? (
        <EmptyState
          icon={<CircleAlert size={30} color={colors.textHeading} strokeWidth={2} />}
          title="No pude cargar tus plantas"
          description="Algo se interrumpió por el camino. Podemos intentarlo otra vez."
          actionLabel="Volver a intentar"
          onAction={() => void refetch()}
        />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={<Sprout size={30} color={colors.actionPrimaryHover} strokeWidth={2} />}
          title="Todavía no hay plantas"
          description="Agrega la primera y podrá contarte cómo se siente y cuándo necesita agua."
          actionLabel="Agregar planta"
          onAction={() => router.push('/plant/nueva')}
        />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(plant) => plant.id}
          renderItem={({ item }) => <PlantRow plant={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabBarHeight + space[8] },
          ]}
          showsVerticalScrollIndicator={false}
          refreshing={isFetching}
          onRefresh={() => void refetch()}
        />
      )}
    </View>
  );
}

function PlantRow({ plant }: { plant: HomePlant }) {
  const tone = STATUS_TONE[plant.status];
  const presentation = STATUS_PRESENTATION[plant.status];
  const photo = useSignedPhotoUrl(plant.photoPath);
  const photoUrl = photo.data ?? null;
  // `active = false` es una planta congelada por bajar de plan. Se muestra atenuada y
  // con candado, nunca oculta ni borrada (FlorySpec §333): sus datos siguen ahí.
  const frozen = !plant.active;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plant.nickname}. ${presentation.label}`}
      onPress={() => router.push({ pathname: '/plant/[id]', params: { id: plant.id } })}
      style={({ pressed }) => [styles.card, frozen && styles.cardFrozen, pressed && styles.pressed]}
    >
      <View style={[styles.visual, { backgroundColor: tone.soft }]}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.plantPhoto}
            contentFit="cover"
            transition={180}
            accessibilityLabel={`Foto de ${plant.nickname}`}
          />
        ) : (
          <>
            <View pointerEvents="none" style={[styles.visualOrb, { borderColor: tone.accent }]} />
            <View style={styles.mascotWrap}>
              <FloryMascot pose={presentation.pose} height={94} />
            </View>
          </>
        )}

        {frozen ? (
          <View style={styles.lockBadge}>
            <Lock size={11} color={colors.textOnBrand} strokeWidth={2.6} />
          </View>
        ) : null}
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.identity}>
            <Text style={styles.name}>{plant.nickname}</Text>
            <Text style={styles.species}>
              {plant.species?.commonName ?? 'Especie por identificar'}
            </Text>
          </View>
          <View style={styles.chevron}>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2.2} />
          </View>
        </View>

        <View style={styles.plantVoice}>
          <View style={[styles.statusDot, { backgroundColor: tone.accent }]} />
          <Text style={styles.plantVoiceText}>
            {frozen ? 'Mi cuidado está en pausa' : presentation.label}
          </Text>
        </View>

        <View style={styles.wateringRow}>
          <Droplets size={15} color={colors.actionPrimaryHover} strokeWidth={2.2} />
          <Text style={styles.when}>
            {frozen ? 'Sin recordatorios por ahora' : wateringLabel(plant.nextWateringAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
      <Button
        label={actionLabel}
        onPress={onAction}
        leadingIcon={
          actionLabel === 'Volver a intentar' ? (
            <RefreshCw size={19} color={colors.textOnBrand} strokeWidth={2.2} />
          ) : (
            <Plus size={20} color={colors.textOnBrand} strokeWidth={2.2} />
          )
        }
        style={styles.emptyButton}
      />
    </View>
  );
}

function compareByUrgency(a: HomePlant, b: HomePlant): number {
  // Las congeladas se van al final: no hay nada que hacer con ellas hasta cambiar de plan.
  if (a.active !== b.active) return a.active ? -1 : 1;

  const weight = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  if (weight !== 0) return weight;

  // A igual estado, primero la que toca antes. Sin fecha va al final: no compite con
  // una planta que sí tiene un riego agendado.
  const aTime = a.nextWateringAt ? Date.parse(a.nextWateringAt) : Number.POSITIVE_INFINITY;
  const bTime = b.nextWateringAt ? Date.parse(b.nextWateringAt) : Number.POSITIVE_INFINITY;
  return aTime - bTime;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingBottom: space[4],
  },
  headerCopy: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.h2,
    color: colors.textHeading,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textMuted,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionPrimary,
  },
  bannerWrap: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
  },
  list: {
    paddingHorizontal: layout.gutter,
    gap: space[4],
  },
  card: {
    minHeight: 154,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    ...elevation.sm,
  },
  cardFrozen: {
    opacity: 0.55,
  },
  visual: {
    position: 'relative',
    width: 112,
    minHeight: 152,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopLeftRadius: radius.lg - 1,
    borderBottomLeftRadius: radius.lg - 1,
  },
  visualOrb: {
    position: 'absolute',
    width: 104,
    height: 104,
    top: -30,
    right: -48,
    borderRadius: 52,
    borderWidth: 1,
    opacity: 0.32,
  },
  mascotWrap: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  plantPhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  statusDot: {
    width: 9,
    height: 9,
    flexShrink: 0,
    borderRadius: radius.pill,
  },
  lockBadge: {
    position: 'absolute',
    left: space[3],
    top: space[3],
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textMuted,
    borderWidth: 2,
    borderColor: colors.surfaceCard,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    padding: space[4],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.h4,
    color: colors.textHeading,
  },
  species: {
    ...typography.xs,
    marginTop: 1,
    color: colors.textMuted,
  },
  chevron: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPageAlt,
  },
  plantVoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[4],
  },
  plantVoiceText: {
    ...typography.sm,
    flex: 1,
    fontFamily: fonts.bodySemibold,
    color: colors.textHeading,
  },
  wateringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginTop: space[2],
  },
  when: {
    ...typography.xs,
    flex: 1,
    color: colors.textMuted,
  },
  skeleton: {
    paddingHorizontal: layout.gutter,
    gap: space[4],
  },
  skeletonRow: {
    height: 154,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
    paddingBottom: space[16],
    gap: space[2],
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
    marginBottom: space[4],
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textHeading,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyButton: {
    marginTop: space[6],
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.72,
  },
});
