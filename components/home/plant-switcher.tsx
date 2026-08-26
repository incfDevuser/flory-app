import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import type { HomePlant } from '@/lib/home-plants';
import { STATUS_TONE } from '@/lib/plant-vocab';
import { colors, fonts, layout, radius, space, type as typography } from '@/theme/tokens';

/**
 * Selector de planta del Home.
 *
 * Reemplaza a los puntitos, que decían en qué planta estabas pero no dejaban ir a otra:
 * con tres o más plantas, llegar a la última obligaba a barrer la pantalla varias veces
 * a ciegas, porque el punto no dice de quién es.
 *
 * No es la «lista intermedia» que prohíbe FlorySpec §280: no hay una pantalla previa
 * que atravesar, el control vive en la misma vista y el swipe sigue funcionando igual.
 *
 * La miniatura es la inicial y no la foto porque la subida de fotos todavía no existe.
 * Cuando exista, se cambia acá y en ningún otro lugar.
 */

type PlantSwitcherProps = {
  plants: HomePlant[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

export function PlantSwitcher({ plants, activeIndex, onSelect }: PlantSwitcherProps) {
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const { width: screenWidth } = useWindowDimensions();

  // Al deslizar el héroe, el chip activo puede quedar fuera de la tira. Se acerca solo,
  // porque un indicador de posición que hay que buscar no indica nada.
  useEffect(() => {
    const chip = chipLayouts.current[activeIndex];
    if (!chip) return;

    const visibleWidth = screenWidth - layout.gutter * 2;
    const target = chip.x + chip.width / 2 - visibleWidth / 2;

    scrollRef.current?.scrollTo({ x: Math.max(0, target), animated: true });
  }, [activeIndex, screenWidth]);

  const handleChipLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    chipLayouts.current[index] = { x, width };
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.root}
      // Sin esto, un toque que empieza con un arrastre mínimo no llega al chip.
      keyboardShouldPersistTaps="handled"
    >
      {plants.map((plant, index) => {
        const selected = index === activeIndex;
        const tone = STATUS_TONE[plant.status];

        return (
          <Pressable
            key={plant.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={plant.nickname}
            onLayout={handleChipLayout(index)}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: tone.soft }]}>
              <Text style={[styles.initial, { color: colors.textHeading }]}>
                {getInitial(plant.nickname)}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: tone.accent }]} />
            </View>

            <Text
              numberOfLines={1}
              style={[styles.name, selected && styles.nameSelected]}
            >
              {plant.nickname}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * `Array.from` y no `nickname[0]`: los índices de una cadena son unidades UTF-16, así
 * que un nombre que empiece con emoji devolvería media pareja subrogada y se pintaría
 * como un rombo.
 */
function getInitial(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0].toUpperCase();
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 0,
  },
  content: {
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    // 44 de alto: el mínimo táctil del sistema (layout.tapMin es para Material).
    height: 44,
    paddingLeft: space[1],
    paddingRight: space[3],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceCard,
    maxWidth: 168,
  },
  chipSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.surfaceBrandSoft,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Mismo motivo que en Perfil: sin interlineado ni tracking heredados, o la letra
   *  no queda centrada dentro del círculo. */
  initial: {
    fontFamily: fonts.display,
    fontSize: 15,
    lineHeight: undefined,
    letterSpacing: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  statusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.bgPage,
  },
  name: {
    ...typography.sm,
    flexShrink: 1,
    fontFamily: fonts.bodySemibold,
    color: colors.textMuted,
  },
  nameSelected: {
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  pressed: {
    opacity: 0.7,
  },
});
