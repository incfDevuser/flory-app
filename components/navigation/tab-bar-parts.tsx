import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { use, useCallback } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { colors, radius, space, type as typography } from '@/theme/tokens';
import { TAB_ORDER, TABS, type TabIcon } from './tabs.config';

export type TabItem = {
  key: string;
  name: string;
  label: string;
  icon: TabIcon;
  isFocused: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
};

/**
 * Traduce el estado de React Navigation a algo que el bar pueda pintar, y encapsula el
 * protocolo de `tabPress`: hay que emitir el evento, respetar `defaultPrevented` (así
 * una pantalla puede cancelar el cambio de pestaña) y no navegar si ya estás ahí.
 *
 * Se itera `TAB_ORDER`, no `state.routes`: el orden del navegador depende de cómo se
 * declaren las pantallas en el layout, y no queremos que mover una línea allí reordene
 * el bar en silencio. Una ruta dentro de (tabs) que no esté en TABS no se pinta.
 */
export function useTabItems({ state, descriptors, navigation }: BottomTabBarProps): TabItem[] {
  return TAB_ORDER.flatMap((name) => {
    const index = state.routes.findIndex((candidate) => candidate.name === name);
    if (index === -1) return [];

    const route = state.routes[index];
    const { label, icon } = TABS[name];
    const isFocused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    const onLongPress = () => {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    };

    return [
      {
        key: route.key,
        name: route.name,
        label,
        icon,
        isFocused,
        onPress,
        onLongPress,
        accessibilityLabel: descriptors[route.key].options.tabBarAccessibilityLabel,
      },
    ];
  });
}

/**
 * Un `tabBar` propio rompe `useBottomTabBarHeight()`: el navegador inicializa la altura
 * con `getTabBarHeight()` y solo la corrige cuando el bar por defecto llama al callback
 * de este contexto (BottomTabView.tsx:217-228). Como ese bar no se está usando, hay que
 * reportar la altura medida a mano o las pantallas quedan con el padding equivocado
 * — y en iOS, donde el bar flota en absolute, con el contenido tapado.
 */
export function useReportTabBarHeight() {
  const reportHeight = use(BottomTabBarHeightCallbackContext);

  return useCallback(
    (event: LayoutChangeEvent) => {
      reportHeight?.(event.nativeEvent.layout.height);
    },
    [reportHeight]
  );
}

/**
 * El contenido de una pestaña: icono, píldora de activo y etiqueta.
 * Idéntico en las dos plataformas — lo que cambia es el Pressable que lo envuelve.
 */
export function TabItemContent({
  icon: Icon,
  label,
  isFocused,
}: {
  icon: TabIcon;
  label: string;
  isFocused: boolean;
}) {
  const tint = isFocused ? colors.actionPrimaryHover : colors.textFaint;

  return (
    <View style={styles.content}>
      <View style={[styles.pill, isFocused && styles.pillActive]}>
        <Icon size={24} color={tint} strokeWidth={2} />
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: tint }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: space[1],
  },
  pill: {
    paddingHorizontal: space[4],
    paddingVertical: space[1],
    borderRadius: radius.pill,
  },
  pillActive: {
    backgroundColor: colors.surfaceBrandSoft,
  },
  label: {
    ...typography.tabLabel,
  },
});
