import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { border, colors, layout, palette, shadow, space } from '@/theme/tokens';
import { TabItemContent, useReportTabBarHeight, useTabItems, type TabItem } from './tab-bar-parts';

/**
 * Tab bar de Android: opaco.
 *
 * Sin blur a propósito. `BlurView` en Android es caro y se ve distinto en cada
 * fabricante, así que aquí la profundidad la da `elevation` y la superficie es sólida.
 * Las props `shadow*` de iOS no renderizan en Android, de ahí que los tokens de sombra
 * estén separados por plataforma.
 *
 * El bar va en el flujo, no en absolute: el contenido termina justo encima.
 *
 * `edgeToEdgeEnabled: true` (app.json) hace que la app dibuje por debajo de la barra
 * de navegación del sistema. Sin sumar `insets.bottom` el bar queda tapado — y el inset
 * cambia entre navegación por gestos y la de tres botones, así que hay que probar ambas.
 */
export function FloryTabBar(props: BottomTabBarProps) {
  const items = useTabItems(props);
  const onLayout = useReportTabBarHeight();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]} onLayout={onLayout}>
      {items.map((item) => (
        <AndroidTab key={item.key} item={item} />
      ))}
    </View>
  );
}

function AndroidTab({ item }: { item: TabItem }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: item.isFocused }}
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      // Ripple en vez del scale de iOS: es el feedback que espera Material.
      android_ripple={{ color: palette.green100, borderless: true, radius: 44 }}
      style={styles.tab}
    >
      <TabItemContent icon={item.icon} label={item.label} isFocused={item.isFocused} />
    </Pressable>
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
    ...shadow.android.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Material pide 48dp, dos más que las HIG de iOS.
    minHeight: layout.tapMin,
  },
});
