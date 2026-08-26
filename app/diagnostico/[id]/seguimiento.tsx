import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { useDiagnosisDetail } from '@/lib/plant-detail';

/**
 * Seguimiento del diagnóstico. El trigger `schedule_followup` lo programa a 21 días si el
 * plan lo incluye (tables.sql:543). Aquí solo se recuerda cuándo toca volver a mirar; el
 * recordatorio real llega por notificación.
 */
export default function SeguimientoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useDiagnosisDetail(id);

  if (query.isPending) {
    return <Screen title="Seguimiento" description="Un momento…" />;
  }

  const followupAt = query.data?.followupAt ?? null;

  if (!followupAt) {
    return (
      <Screen
        title="Seguimiento"
        description="Por ahora no necesito una revisión de seguimiento. Si algo cambia, mírame con una foto nueva."
      />
    );
  }

  const when = new Date(followupAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

  return (
    <Screen
      eyebrow="Seguimiento"
      title="Volveré a mirarme"
      description={`Cerca del ${when} te aviso para revisarme de nuevo y ver si mejoré con lo que hicimos.`}
    />
  );
}
