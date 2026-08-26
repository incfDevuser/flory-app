import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { use, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, space, type as typography } from '@/theme/tokens';

type ScreenProps = {
  title: string;
  /** La única mayúscula del sistema (§3). Opcional. */
  eyebrow?: string;
  description?: string;
  children?: ReactNode;
  /** Las pantallas de stack ya traen header, así que no necesitan el inset superior. */
  edgeToEdgeTop?: boolean;
};

/**
 * Andamio de las pantallas todavía sin construir.
 *
 * Respeta el fondo crema (`--bg-page`), los gutters de 20px y —lo importante— deja
 * hueco abajo para el tab bar: en iOS el bar flota en absolute y taparía el contenido.
 * `BottomTabBarHeightContext` devuelve `undefined` fuera de un navegador de tabs, que es
 * el caso de todo lo que se empuja encima.
 */
export function Screen({
  title,
  eyebrow,
  description,
  children,
  edgeToEdgeTop = false,
}: ScreenProps) {
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0;
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: edgeToEdgeTop ? insets.top + space[6] : space[6],
            paddingBottom: tabBarHeight + space[8],
          },
        ]}
      >
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    paddingHorizontal: layout.gutter,
    gap: space[2],
  },
  eyebrow: {
    ...typography.eyebrow,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  title: {
    ...typography.h3,
    color: colors.textHeading,
  },
  description: {
    ...typography.md,
    color: colors.textBody,
  },
});
