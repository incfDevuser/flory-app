import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { border, colors, layout, space } from '@/theme/tokens';
import { TabItemContent, useReportTabBarHeight, useTabItems } from './tab-bar-parts';

/**
 * Fallback. Metro resuelve `tab-bar.ios.tsx` en iOS y `tab-bar.android.tsx` en Android,
 * así que este archivo solo se usa en web (`npm run web`), que existe como vía rápida
 * de iteración, no como plataforma de producto.
 *
 * Sin blur y sin ripple: opaco y quieto.
 */
export function FloryTabBar(props: BottomTabBarProps) {
  const items = useTabItems(props);
  const onLayout = useReportTabBarHeight();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]} onLayout={onLayout}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.isFocused }}
          accessibilityLabel={item.accessibilityLabel ?? item.label}
          onPress={item.onPress}
          onLongPress={item.onLongPress}
          style={styles.tab}
        >
          <TabItemContent icon={item.icon} label={item.label} isFocused={item.isFocused} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderTopWidth: border.width,
    borderTopColor: colors.borderSubtle,
    paddingTop: space[2],
    paddingHorizontal: space[2] + 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.tapMin,
  },
});
