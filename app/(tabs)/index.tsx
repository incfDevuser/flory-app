import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { CircleAlert, CloudOff, Plus, RefreshCw, Sprout } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlantHomeSlide } from '@/components/home/plant-home-slide';
import { PlantSwitcher } from '@/components/home/plant-switcher';
import { WateringSheet } from '@/components/home/watering-sheet';
import type { HomePlant } from '@/lib/home-plants';
import { FloryMascot, FloryWordmark } from '@/components/ui/brand';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useHomePlants } from '@/lib/home-plants';
import { useOffline } from '@/lib/use-offline';
import { useSession } from '@/lib/session';
import { colors, layout, radius, space, type as typography } from '@/theme/tokens';

export default function HoyScreen() {
  const { userId } = useSession();
  const offline = useOffline();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { plants, isLoading, isError, isFromCache, isFetching, refetch } = useHomePlants(
    userId,
    offline
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [wateringPlantId, setWateringPlantId] = useState<string | null>(null);
  const wateringPlant = plants.find((plant) => plant.id === wateringPlantId) ?? null;
  const listRef = useRef<FlatList<HomePlant>>(null);

  useEffect(() => {
    if (activeIndex >= plants.length) setActiveIndex(Math.max(0, plants.length - 1));
  }, [activeIndex, plants.length]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  // El índice se adelanta al scroll para que el chip responda en el mismo frame del
  // toque; `onMomentumScrollEnd` lo confirma cuando la animación termina.
  const handleSelect = (index: number) => {
    setActiveIndex(index);
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  /**
   * Cada página mide exactamente el ancho de la pantalla, así que la posición se sabe
   * sin medir. Sin esto, `scrollToIndex` hacia una planta que aún no se ha renderizado
   * dispara el error de «scrollToIndex should be used in conjunction with
   * getItemLayout» y el salto queda a medias.
   */
  const getItemLayout = useCallback(
    (_: ArrayLike<HomePlant> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width]
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space[2] }]}>
        <FloryWordmark width={78} />
        <Text style={styles.today}>Hoy</Text>
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
        <HomeSkeleton bottomInset={tabBarHeight} />
      ) : isError ? (
        <HomeState
          icon={<CircleAlert size={28} color={colors.textHeading} strokeWidth={2} />}
          title="No pude cargar tu jardín"
          description="Parece que algo se interrumpió. Podemos intentarlo otra vez."
          actionLabel="Volver a intentar"
          actionIcon={<RefreshCw size={19} color={colors.textOnBrand} strokeWidth={2.2} />}
          onAction={() => void refetch()}
        />
      ) : plants.length === 0 ? (
        <HomeState
          icon={<Sprout size={30} color={colors.actionPrimaryHover} strokeWidth={2} />}
          title="Todavía no hay una planta aquí"
          description="Cuando agregues una, podrá contarte cómo se siente y cuándo necesita agua."
          actionLabel="Agregar una planta"
          actionIcon={<Plus size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
          onAction={() => router.push('/plant/nueva')}
        />
      ) : (
        <>
          {plants.length > 1 ? (
            <PlantSwitcher plants={plants} activeIndex={activeIndex} onSelect={handleSelect} />
          ) : null}

          <FlatList
            ref={listRef}
            horizontal
            pagingEnabled
            bounces={false}
            data={plants}
            keyExtractor={(plant) => plant.id}
            getItemLayout={getItemLayout}
            renderItem={({ item }) => (
              <PlantHomeSlide
                plant={item}
                userId={userId}
                width={width}
                bottomInset={tabBarHeight}
                refreshing={isFetching}
                onRefresh={() => void refetch()}
                onWater={() => setWateringPlantId(item.id)}
                wateringDisabled={offline}
              />
            )}
            onMomentumScrollEnd={handleMomentumEnd}
            showsHorizontalScrollIndicator={false}
            initialNumToRender={1}
            windowSize={3}
          />
        </>
      )}

      {wateringPlant && userId ? (
        <WateringSheet
          key={wateringPlant.id}
          plant={wateringPlant}
          userId={userId}
          onClose={() => setWateringPlantId(null)}
        />
      ) : null}
    </View>
  );
}

function HomeState({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.state}>
      <View style={styles.stateArt}>
        <View style={styles.stateIcon}>{icon}</View>
        <FloryMascot pose="saluda" height={178} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{description}</Text>
      <Button label={actionLabel} onPress={onAction} leadingIcon={actionIcon} style={styles.stateButton} />
    </Animated.View>
  );
}

function HomeSkeleton({ bottomInset }: { bottomInset: number }) {
  return (
    <View
      accessibilityLabel="Cargando tu jardín"
      accessibilityRole="progressbar"
      style={[styles.skeleton, { paddingBottom: bottomInset + space[6] }]}
    >
      <View style={[styles.skeletonBlock, styles.skeletonHero]} />
      <View style={[styles.skeletonBlock, styles.skeletonTitle]} />
      <View style={[styles.skeletonBlock, styles.skeletonLine]} />
      <View style={[styles.skeletonBlock, styles.skeletonLineShort]} />
      <View style={[styles.skeletonBlock, styles.skeletonButton]} />
      <View style={[styles.skeletonBlock, styles.skeletonButton]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  today: {
    ...typography.sm,
    color: colors.textMuted,
  },
  bannerWrap: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[2],
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
    paddingBottom: space[16],
  },
  stateArt: {
    width: 228,
    height: 228,
    borderRadius: 114,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colors.surfaceBrandSoft,
    overflow: 'hidden',
    marginBottom: space[6],
  },
  stateIcon: {
    position: 'absolute',
    top: space[5],
    right: space[5],
    zIndex: 2,
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    ...typography.h2,
    color: colors.textHeading,
    textAlign: 'center',
  },
  stateBody: {
    ...typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space[2],
    maxWidth: 340,
  },
  stateButton: {
    marginTop: space[6],
    alignSelf: 'stretch',
  },
  skeleton: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    gap: space[4],
    alignItems: 'center',
  },
  skeletonBlock: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  skeletonHero: {
    width: 224,
    height: 224,
    borderRadius: 112,
  },
  skeletonTitle: {
    width: 154,
    height: 38,
    marginTop: space[1],
  },
  skeletonLine: {
    width: '88%',
    height: 18,
  },
  skeletonLineShort: {
    width: '54%',
    height: 18,
  },
  skeletonButton: {
    alignSelf: 'stretch',
    height: 54,
    borderRadius: radius.pill,
  },
});
