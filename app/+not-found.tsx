import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { colors, layout, space, type as typography } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Por aquí no es' }} />
      <View style={styles.root}>
        <Text style={styles.title}>Esta pantalla no existe.</Text>
        <Button label="Volver al inicio" onPress={() => router.replace('/')} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPage,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
    gap: space[4],
  },
  title: {
    ...typography.h3,
    fontWeight: typography.weight.extrabold,
    color: colors.textHeading,
    textAlign: 'center',
  },
});
