import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Camera, CloudOff, ImagePlus, Images, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { FloryMascot } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { useHomePlants } from '@/lib/home-plants';
import { deletePlantPhoto, uploadPlantPhoto, useSignedPhotoUrl } from '@/lib/plant-photo';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { colors, fonts, layout, radius, space, type as typography } from '@/theme/tokens';

export default function EditarPlantaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { plants } = useHomePlants(userId, offline);
  const plant = plants.find((item) => item.id === id) ?? null;
  const currentPath = plant?.photoPath ?? null;
  const signed = useSignedPhotoUrl(currentPath);

  const [failed, setFailed] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId ?? 'anon') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.plantDetail(id) }),
    ]);
  };

  const save = useMutation({
    mutationFn: async (localUri: string) => {
      if (!userId) throw new Error('Sin sesión');
      const path = await uploadPlantPhoto({ userId, plantId: id, localUri });

      const { error } = await supabase.from('plants').update({ photo_url: path }).eq('id', id);
      if (error) {
        // La fila no quedó apuntando a la foto nueva: se limpia para no dejarla huérfana.
        await deletePlantPhoto(path);
        throw error;
      }

      // Solo ahora que la planta apunta a la nueva ruta se borra la anterior.
      if (currentPath) await deletePlantPhoto(currentPath);
    },
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError: () => setFailed(true),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('plants').update({ photo_url: null }).eq('id', id);
      if (error) throw error;
      if (currentPath) await deletePlantPhoto(currentPath);
    },
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError: () => setFailed(true),
  });

  const busy = save.isPending || remove.isPending;

  const pickFrom = async (from: 'camera' | 'library') => {
    setFailed(false);

    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        from === 'camera' ? 'Necesito la cámara' : 'Necesito tus fotos',
        'Para ponerle una foto a tu planta, dame acceso desde los ajustes del teléfono.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
          });

    if (result.canceled) return;
    save.mutate(result.assets[0].uri);
  };

  const confirmRemove = () => {
    Alert.alert('Quitar foto', 'Volveré a mostrarme con mi ilustración.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  };

  const previewUri = signed.data ?? null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: plant ? `Foto de ${plant.nickname}` : 'Foto' }} />

      <View style={[styles.content, { paddingBottom: insets.bottom + space[6] }]}>
        {offline ? (
          <Banner
            tone="offline"
            icon={<CloudOff size={18} color={colors.textMuted} strokeWidth={2.2} />}
            message="Estás sin conexión. Puedes cambiar mi foto cuando vuelvas a tener red."
          />
        ) : null}

        <View style={styles.previewWrap}>
          <View style={styles.preview}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                style={styles.previewImage}
                contentFit="cover"
                transition={180}
                accessibilityLabel={plant ? `Foto de ${plant.nickname}` : 'Foto de la planta'}
              />
            ) : (
              <View style={styles.placeholder}>
                <FloryMascot pose="saluda" height={150} />
                <View style={styles.placeholderBadge}>
                  <ImagePlus size={18} color={colors.textOnBrand} strokeWidth={2.2} />
                </View>
              </View>
            )}
          </View>
          <Text style={styles.hint}>
            {previewUri
              ? 'Esta es mi foto. Puedes cambiarla o quitarla.'
              : 'Ponme una foto para reconocerme de un vistazo.'}
          </Text>
        </View>

        {failed ? (
          <Banner message="No pude guardar la foto. Tu planta sigue igual; intentémoslo otra vez." />
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Tomar foto"
            onPress={() => pickFrom('camera')}
            loading={save.isPending}
            disabled={offline || busy}
            leadingIcon={<Camera size={20} color={colors.textOnBrand} strokeWidth={2.2} />}
          />
          <Button
            label="Elegir de galería"
            variant="secondary"
            onPress={() => pickFrom('library')}
            disabled={offline || busy}
            leadingIcon={<Images size={20} color={colors.textHeading} strokeWidth={2.2} />}
          />
          {currentPath ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar foto"
              accessibilityState={{ disabled: offline || busy }}
              disabled={offline || busy}
              onPress={confirmRemove}
              style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
            >
              <Trash2 size={18} color={colors.textDestructive} strokeWidth={2.2} />
              <Text style={styles.removeLabel}>Quitar foto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.gutter,
    paddingTop: space[5],
    gap: space[5],
  },
  previewWrap: {
    alignItems: 'center',
    gap: space[3],
  },
  preview: {
    width: 220,
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  placeholderBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionPrimary,
  },
  hint: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    gap: space[3],
    marginTop: 'auto',
  },
  remove: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  removeLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textDestructive,
  },
  pressed: {
    opacity: 0.6,
  },
});
