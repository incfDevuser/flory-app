import { useLocalSearchParams } from 'expo-router';
import { CloudOff } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DiagnosisRow } from '@/components/plant/diagnosis-row';
import { Banner } from '@/components/ui/banner';
import { usePlantDiagnosesAll } from '@/lib/plant-detail';
import { useOffline } from '@/lib/use-offline';
import { colors, layout, radius, space, type as typography } from '@/theme/tokens';

/**
 * Historial completo de diagnósticos de una planta. Vive fuera de la ficha porque una
 * lista larga la estiraba demasiado; la ficha muestra solo los más recientes y enlaza
 * aquí. Cada fila abre el detalle del diagnóstico.
 */
export default function PlantaDiagnosticosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const offline = useOffline();
  const diagnoses = usePlantDiagnosesAll(id, offline);

  const rows = diagnoses.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {offline ? (
        <Banner
          tone="offline"
          icon={<CloudOff size={18} color={colors.textMuted} strokeWidth={2.2} />}
          message="Estás sin conexión. Te muestro tus diagnósticos cuando vuelvas a tener red."
        />
      ) : diagnoses.isError ? (
        <Placeholder text="No pude cargar mis diagnósticos. Inténtalo de nuevo en un momento." />
      ) : diagnoses.isPending ? (
        <Placeholder text="Cargando…" />
      ) : rows.length === 0 ? (
        <Placeholder text="Todavía no me has revisado con una foto." />
      ) : (
        <View style={styles.card}>
          {rows.map((entry, index, list) => (
            <DiagnosisRow key={entry.id} entry={entry} last={index === list.length - 1} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    padding: layout.gutter,
    gap: space[4],
    paddingBottom: space[12],
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  placeholder: {
    paddingHorizontal: space[4],
    paddingVertical: space[5],
  },
  placeholderText: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
