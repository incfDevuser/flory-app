import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, Images } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setPendingCapture } from '@/components/diagnostico/diagnosis-flow';
import { ChoiceChip } from '@/components/onboarding/choices';
import { Button } from '@/components/ui/button';
import type { DiagnosisFocus } from '@/lib/ai';
import { colors, layout, palette, radius, space, type as typography } from '@/theme/tokens';

/**
 * Modos de diagnóstico. El foco no filtra el análisis: le dice al modelo dónde mirar
 * primero para que no tenga que deducir la intención. El hint de la cámara se adapta a
 * lo elegido para que la foto llegue con lo que ese modo necesita.
 */
const FOCUS_MODES: { value: DiagnosisFocus; label: string; hint: string }[] = [
  {
    value: 'general',
    label: 'General',
    hint: 'Con buena luz y de cerca. Si algo se ve raro en una hoja, enfócala: así puedo mirarte mejor.',
  },
  {
    value: 'plagas',
    label: 'Plagas',
    hint: 'Acércate al envés de las hojas, los nudos y la tierra. Los bichitos y el polvillo se me escapan de lejos.',
  },
  {
    value: 'hojas',
    label: 'Hojas',
    hint: 'Enfoca las hojas con el problema: manchas, bordes o color. De cerca y con buena luz.',
  },
];

/**
 * Encuadre para el diagnóstico. Se usa la cámara nativa (expo-image-picker), no un visor
 * propio: es el mismo patrón que la foto de la planta y evita sumar expo-camera.
 *
 * Sin recorte (`allowsEditing: false`): recortar podría dejar fuera justo la hoja con el
 * síntoma. La foto no se sube aquí; se guarda en memoria y la pantalla de análisis la
 * manda a la Edge Function. La llave de OpenAI nunca pasa por el cliente.
 */
export default function CamaraScreen() {
  const insets = useSafeAreaInsets();
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const [focus, setFocus] = useState<DiagnosisFocus>('general');

  const mode = FOCUS_MODES.find((option) => option.value === focus) ?? FOCUS_MODES[0];

  const capture = async (from: 'camera' | 'library') => {
    if (!plantId) {
      Alert.alert('No sé a quién mirar', 'Abre mi ficha y toca «¿Cómo me ves?» otra vez.');
      return;
    }

    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        from === 'camera' ? 'Necesito la cámara' : 'Necesito tus fotos',
        'Para mirarme necesito ver una foto. Dame acceso desde los ajustes del teléfono.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

    if (result.canceled) return;

    const asset = result.assets[0];
    setPendingCapture({
      plantId,
      localUri: asset.uri,
      focus,
      width: asset.width,
      height: asset.height,
    });
    router.replace('/diagnostico/analizando');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }]}>
      <Pressable onPress={() => router.back()} style={styles.close} accessibilityRole="button">
        <Text style={styles.closeLabel}>Cerrar</Text>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.frame}>
          <Camera size={40} color={palette.lime400} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Muéstrame entera</Text>

        <Text style={styles.modeQuestion}>¿Qué quieres que revise?</Text>
        <View style={styles.modeRow}>
          {FOCUS_MODES.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={option.value === focus}
              onPress={() => setFocus(option.value)}
            />
          ))}
        </View>

        <Text style={styles.hint}>{mode.hint}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Tomar foto"
          onPress={() => capture('camera')}
          leadingIcon={<Camera size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
        />
        <Button
          label="Elegir de galería"
          variant="secondary"
          onPress={() => capture('library')}
          leadingIcon={<Images size={20} color={colors.textHeading} strokeWidth={2.2} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceForest,
    paddingHorizontal: layout.gutter,
    gap: space[4],
  },
  close: {
    alignSelf: 'flex-start',
    paddingVertical: space[2],
  },
  closeLabel: {
    ...typography.md,
    fontFamily: typography.button.fontFamily,
    color: colors.textOnForest,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  frame: {
    width: 132,
    height: 132,
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: palette.lime400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textOnForest,
    textAlign: 'center',
  },
  modeQuestion: {
    ...typography.sm,
    fontFamily: typography.eyebrow.fontFamily,
    color: colors.textOnForest,
    opacity: 0.85,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space[2],
  },
  hint: {
    ...typography.md,
    color: colors.textOnForest,
    textAlign: 'center',
    opacity: 0.85,
    maxWidth: 320,
  },
  actions: {
    gap: space[3],
  },
});
