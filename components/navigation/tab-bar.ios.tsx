import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { border, colors, motion, space } from '@/theme/tokens';
import { TabItemContent, useReportTabBarHeight, useTabItems, type TabItem } from './tab-bar-parts';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Aproxima el `--ease-spring` del design system: rebota, no frena en seco. */
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.5 } as const;

/**
 * Tab bar de iOS: cristal.
 *
 * Flota en `position: absolute` sobre el contenido, con blur real y una capa de crema
 * al 72 % encima (`--glass-cream` + `--blur-glass`, §5). Las pantallas compensan con
 * el padding que sale de `useBottomTabBarHeight()`.
 *
 * La versión de Android es deliberadamente distinta: allí BlurView es caro e
 * inconsistente entre fabricantes, que es justo el motivo de tener dos archivos.
 */
export function FloryTabBar(props: BottomTabBarProps) {
  const items = useTabItems(props);
  const onLayout = useReportTabBarHeight();
  const insets = useSafeAreaInsets();

  return (
    <BlurView intensity={32} tint="light" style={styles.bar} onLayout={onLayout}>
      <View
        style={[
          styles.inner,
          // 22px es el valor del doc; el indicador de inicio manda cuando es más alto.
          { paddingBottom: Math.max(insets.bottom, 22) },
        ]}
      >
        {items.map((item) => (
          <IosTab key={item.key} item={item} />
        ))}
      </View>
    </BlurView>
  );
}

function IosTab({ item }: { item: TabItem }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: item.isFocused }}
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      onPressIn={() => scale.set(withSpring(motion.pressScale, PRESS_SPRING))}
      onPressOut={() => scale.set(withSpring(1, PRESS_SPRING))}
      onPress={() => {
        // Selección, no impacto: es un cambio de contexto, no una confirmación.
        Haptics.selectionAsync();
        item.onPress();
      }}
      onLongPress={item.onLongPress}
      style={[styles.tab, animatedStyle]}
    >
      <TabItemContent icon={item.icon} label={item.label} isFocused={item.isFocused} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: border.width,
    borderTopColor: colors.borderSubtle,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glassCream,
    paddingTop: space[2],
    paddingHorizontal: space[2] + 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    // 44px es el mínimo táctil de las HIG.
    minHeight: 44,
    justifyContent: 'center',
  },
});
