import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { colors, elevation, layout, radius, space, type as typography } from '@/theme/tokens';

const MAX_NAME_LENGTH = 60;

export function PlantNameSheet({
  plantId,
  currentName,
  userId,
  onClose,
}: {
  plantId: string;
  currentName: string;
  userId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const trimmedName = name.trim();

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('plants')
        .update({ nickname: trimmedName })
        .eq('id', plantId)
        .select('id')
        .single();

      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plantDetail(plantId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId) }),
      ]);
      onClose();
    },
  });

  const canSave =
    trimmedName.length > 0 &&
    trimmedName.length <= MAX_NAME_LENGTH &&
    trimmedName !== currentName.trim();

  const close = () => {
    if (!save.isPending) onClose();
  };

  return (
    <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modal}
      >
        <Pressable accessibilityLabel="Cerrar" onPress={close} style={styles.backdrop} />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>¿Cómo me llamo?</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              disabled={save.isPending}
              onPress={close}
              style={styles.close}
            >
              <X size={21} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Field
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            label="Nombre de la planta"
            maxLength={MAX_NAME_LENGTH}
            onChangeText={setName}
            onSubmitEditing={() => {
              if (canSave && !save.isPending) save.mutate();
            }}
            returnKeyType="done"
            value={name}
          />

          {save.isError ? (
            <Banner message="No pude guardar mi nombre. Inténtalo de nuevo en un momento." />
          ) : null}

          <Button
            disabled={!canSave}
            label="Guardar nombre"
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,75,46,0.28)',
  },
  sheet: {
    gap: space[4],
    paddingTop: space[3],
    paddingHorizontal: layout.gutter,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.bgPageAlt,
    ...elevation.lg,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderDefault,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
  },
  title: {
    ...typography.h3,
    flex: 1,
    color: colors.textHeading,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
});
