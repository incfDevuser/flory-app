import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type as typography } from '@/theme/tokens';

/**
 * Separador «o» entre el formulario y el login social (FlorySpec §91).
 *
 * La línea se corta a los lados de la etiqueta en vez de pasar por detrás, que es lo
 * que hace un `borderTop` con el texto encima y siempre deja un halo mal alineado.
 */
export function DividerO({ label = 'o' }: { label?: string }) {
  return (
    // Decorativo puro: separa visualmente, no aporta información al lector de pantalla.
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.borderSubtle,
  },
  label: {
    ...typography.sm,
    color: colors.textMuted,
  },
});
