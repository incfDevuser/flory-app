import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { consumePendingCapture, type PendingCapture } from '@/components/diagnostico/diagnosis-flow';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { diagnosePlant, isValidationError, type DiagnoseErrorKind } from '@/lib/ai';
import { toDiagnosisDetail } from '@/lib/plant-detail';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/lib/session';
import { colors, layout, space, type as typography } from '@/theme/tokens';

/**
 * Paso de análisis. Consume la foto que dejó la cámara, la manda a la Edge Function y,
 * al volver, reemplaza esta pantalla por el resultado. Se sale con `router.replace`,
 * nunca hacia atrás: volver aquí desde el resultado no tendría sentido.
 */

const WAITING = [
  'Estoy mirándome con calma…',
  'Reviso mis hojas una por una…',
  'Casi lista…',
];

type Phase = { kind: 'loading' } | { kind: 'error'; message: string; errorKind: DiagnoseErrorKind };

export default function AnalizandoScreen() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tick, setTick] = useState(0);

  // La captura se consume una sola vez; se guarda para poder reintentar sin perder plantId.
  const captureRef = useRef<PendingCapture | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => (t + 1) % WAITING.length), 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const capture = consumePendingCapture();
    if (!capture) {
      // Se llegó sin foto (deep link, recarga): no hay nada que analizar.
      router.back();
      return;
    }
    captureRef.current = capture;
    void run(capture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (capture: PendingCapture) => {
    setPhase({ kind: 'loading' });

    const result = await diagnosePlant({
      plantId: capture.plantId,
      localUri: capture.localUri,
      width: capture.width,
      height: capture.height,
    });

    if (!result.ok) {
      setPhase({ kind: 'error', message: result.message, errorKind: result.kind });
      return;
    }

    // Siembra la ficha para que el resultado aparezca sin un segundo viaje a la red.
    queryClient.setQueryData(
      queryKeys.diagnosis(result.diagnosis.id),
      toDiagnosisDetail(result.diagnosis)
    );

    // El diagnóstico pudo cambiar riego y estado: se invalida lo que lo muestra.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.plantDiagnoses(capture.plantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.plantDiagnosesAll(capture.plantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.plantDetail(capture.plantId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.plantSummary(capture.plantId) }),
      userId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId) })
        : Promise.resolve(),
    ]);

    router.replace({ pathname: '/diagnostico/[id]', params: { id: result.diagnosis.id } });
  };

  if (phase.kind === 'error') {
    // El cupo, la falta de sesión y estar sin red no se arreglan reintentando la foto.
    const canRetry = !['quota', 'offline', 'no_session'].includes(phase.errorKind);
    const validationFailed = isValidationError(phase.errorKind);
    const plantId = captureRef.current?.plantId;

    return (
      <View style={styles.root}>
        <Banner message={phase.message} />
        <View style={styles.actions}>
          {canRetry && plantId ? (
            <Button
              label={validationFailed ? 'Tomar otra foto' : 'Probar de nuevo'}
              onPress={() =>
                router.replace({ pathname: '/diagnostico/camara', params: { plantId } })
              }
            />
          ) : null}
          <Button label="Ahora no" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.actionPrimary} size="large" />
      <Text style={styles.message}>{WAITING[tick]}</Text>
    </View>
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
  message: {
    ...typography.h4,
    color: colors.textHeading,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: space[2],
  },
});
