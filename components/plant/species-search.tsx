import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, Check, Leaf, Search, SearchX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SpeciesChoice } from '@/components/onboarding/onboarding-draft';
import { SpeciesIdentificationSheet } from '@/components/plant/species-identification-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { resolveIdentification } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import {
  border,
  colors,
  elevation,
  fonts,
  palette,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

/**
 * Buscador de especie, compartido por el onboarding y por «planta nueva».
 *
 * Vive fuera de las pantallas porque las dos tienen que buscar igual: mismo debounce,
 * mismo `find_species`, mismas sugerencias y el mismo aviso de tiempos aproximados. Dos
 * copias se separan en silencio, y la que se quede atrás va a mentir sobre el riego.
 */

type SpeciesResult = {
  id: string;
  common_name: string;
  scientific_name: string;
  image_url: string | null;
  verified_cl: boolean;
  rank?: number;
};

const SUGGESTED_SCIENTIFIC_NAMES = [
  'Epipremnum aureum',
  'Monstera deliciosa',
  'Dracaena trifasciata',
  'Chlorophytum comosum',
  'Zamioculcas zamiifolia',
  'Ficus elastica',
  'Dracaena fragrans',
  'Aloe vera',
] as const;

export type SpeciesSearchProps = {
  selected: SpeciesChoice | null;
  onSelect: (species: SpeciesChoice, attemptId: string | null) => void;
  offline: boolean;
  autoFocus?: boolean;
  identificationAttemptId?: string | null;
};

export function SpeciesSearch({
  selected,
  onSelect,
  offline,
  autoFocus = false,
  identificationAttemptId = null,
}: SpeciesSearchProps) {
  const [query, setQuery] = useState('');
  const [identificationOpen, setIdentificationOpen] = useState(false);
  const [retainedAttemptId, setRetainedAttemptId] = useState<string | null>(null);
  const [resolvingChoiceId, setResolvingChoiceId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const activeAttemptId = retainedAttemptId ?? identificationAttemptId;
  const resolvingChoice = resolvingChoiceId !== null;

  const suggestions = useQuery({
    queryKey: ['species', 'suggestions'],
    enabled: debouncedQuery.length === 0 && !offline,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('species')
        .select('id, common_name, scientific_name, image_url, verified_cl')
        .eq('active', true)
        .in('scientific_name', [...SUGGESTED_SCIENTIFIC_NAMES]);

      if (error) throw error;
      const rows = (data ?? []) as SpeciesResult[];
      // Se reordena en el cliente: `in` no respeta el orden de la lista y el catálogo
      // quedaría en el orden que decida Postgres.
      return SUGGESTED_SCIENTIFIC_NAMES.flatMap((name) =>
        rows.filter((row) => row.scientific_name === name)
      );
    },
  });

  const search = useQuery({
    queryKey: ['species', 'search', debouncedQuery],
    enabled: debouncedQuery.length > 0 && !offline,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('find_species', {
        p_query: debouncedQuery,
        p_limit: 10,
      });
      if (error) throw error;
      return (data ?? []) as SpeciesResult[];
    },
  });

  const hasQuery = query.trim().length > 0;
  const rows = hasQuery ? (search.data ?? []) : (suggestions.data ?? []);
  const isSearching = hasQuery && (query.trim() !== debouncedQuery || search.isPending);
  const isLoading = !hasQuery && suggestions.isPending;
  const hasError = hasQuery ? search.isError : suggestions.isError;

  async function selectSpecies(row: SpeciesResult) {
    Keyboard.dismiss();
    const choice: SpeciesChoice = {
      id: row.id,
      commonName: row.common_name,
      scientificName: row.scientific_name,
      imageUrl: row.image_url,
      approximate: !row.verified_cl,
    };
    await commitSelection(choice, row.id);
  }

  async function selectUnknown() {
    Keyboard.dismiss();
    await commitSelection({
      id: null,
      commonName: 'Planta por identificar',
      scientificName: null,
      imageUrl: null,
      approximate: true,
    }, 'unknown');
  }

  async function commitSelection(choice: SpeciesChoice, choiceId: string) {
    if (resolvingChoice) return;
    setResolutionError(null);

    if (!activeAttemptId) {
      onSelect(choice, null);
      return;
    }

    setResolvingChoiceId(choiceId);
    try {
      const resolution = await resolveIdentification(
        activeAttemptId,
        choice.id ? 'corrigio' : 'no_sabe',
        choice.id ?? undefined
      );
      const resolvedChoice = resolution.species
        ? {
            id: resolution.species.id,
            commonName: resolution.species.commonName,
            scientificName: resolution.species.scientificName,
            imageUrl: null,
            approximate: resolution.species.approximate,
          }
        : choice;
      const resolvedAttemptId = activeAttemptId;
      setRetainedAttemptId(null);
      onSelect(resolvedChoice, resolvedAttemptId);
    } catch (error) {
      setResolutionError(
        error instanceof Error
          ? error.message
          : 'No pude guardar tu elección. Inténtalo de nuevo en un momento.'
      );
    } finally {
      setResolvingChoiceId(null);
    }
  }

  return (
    <>
      <Field
        label="Buscar especie"
        value={query}
        onChangeText={setQuery}
        placeholder="Potus, monstera, sansevieria…"
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        leadingIcon={<Search size={18} color={colors.textFaint} strokeWidth={2.2} />}
      />

      <View style={styles.identificationCallout}>
        <View style={styles.identificationCopy}>
          <Text style={styles.identificationTitle}>¿No sabes mi especie?</Text>
          <Text style={styles.identificationText}>
            Puedo mirar una foto y sugerirte una opción para confirmar.
          </Text>
        </View>
        <Button
          label="Identificarme con una foto"
          variant="secondary"
          size="md"
          disabled={offline || resolvingChoice}
          onPress={() => setIdentificationOpen(true)}
          leadingIcon={<Camera size={18} color={colors.textHeading} strokeWidth={2.2} />}
          style={styles.identificationButton}
        />
      </View>

      {offline ? (
        <Banner
          tone="offline"
          message="No puedo buscar especies sin conexión. Puedes continuar sin identificarme."
        />
      ) : null}

      {selected?.approximate ? (
        <Banner
          tone="info"
          message={
            selected.id
              ? 'Todavía estoy aprendiendo sobre esta especie en Chile. Mis tiempos serán aproximados.'
              : 'Todavía no sé qué especie soy. Empezaré con tiempos aproximados y aprenderé contigo.'
          }
        />
      ) : null}

      {activeAttemptId ? (
        <Banner
          tone="info"
          message="Conservo la sugerencia de la foto mientras buscas la especie correcta."
        />
      ) : null}

      {resolutionError ? <Banner tone="atencion" message={resolutionError} /> : null}

      <View style={styles.listBlock}>
        <Text style={styles.sectionTitle}>{hasQuery ? 'Resultados' : 'Comunes en Chile'}</Text>

        {isSearching || isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.actionPrimary} />
            <Text style={styles.stateText}>Estoy buscando mi nombre…</Text>
          </View>
        ) : null}

        {hasError && !offline ? (
          <Banner tone="atencion" message="No pude buscar ahora. Inténtalo de nuevo en un momento." />
        ) : null}

        {!isSearching && !isLoading && !hasError && rows.length > 0 ? (
          <View style={styles.list}>
            {rows.map((row, index) => (
              <SpeciesRow
                key={row.id}
                row={row}
                index={index}
                selected={selected?.id === row.id}
                disabled={resolvingChoice}
                loading={resolvingChoiceId === row.id}
                onPress={() => void selectSpecies(row)}
              />
            ))}
          </View>
        ) : null}

        {hasQuery && !isSearching && !hasError && rows.length === 0 && !offline ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <SearchX size={28} color={colors.textMuted} strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>No me encuentro con ese nombre</Text>
            <Text style={styles.emptyText}>
              Puedo empezar sin identificarme y ajustar mis tiempos después.
            </Text>
          </View>
        ) : null}
      </View>

      <Button
        label="Continuar sin identificarme"
        variant="ghost"
        size="md"
        loading={resolvingChoiceId === 'unknown'}
        disabled={resolvingChoice}
        onPress={() => void selectUnknown()}
      />

      <SpeciesIdentificationSheet
        visible={identificationOpen}
        offline={offline}
        onClose={() => setIdentificationOpen(false)}
        onConfirm={(species, attemptId) => {
          setIdentificationOpen(false);
          setRetainedAttemptId(null);
          onSelect(species, attemptId);
        }}
        onUnknown={(species, attemptId) => {
          setIdentificationOpen(false);
          setRetainedAttemptId(null);
          onSelect(species, attemptId);
        }}
        onSearch={(attemptId, suggestedQuery) => {
          setRetainedAttemptId(attemptId);
          setQuery(suggestedQuery ?? '');
          setResolutionError(null);
          setIdentificationOpen(false);
        }}
      />
    </>
  );
}

function SpeciesRow({
  row,
  index,
  selected,
  disabled,
  loading,
  onPress,
}: {
  row: SpeciesResult;
  index: number;
  selected: boolean;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  const tint = AVATAR_TONES[index % AVATAR_TONES.length];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.rowSelected : null,
        selected ? elevation.sm : null,
        pressed ? styles.rowPressed : null,
        disabled ? styles.rowDisabled : null,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: tint.background }]}>
        {row.image_url ? (
          <Image
            source={row.image_url}
            style={styles.avatarImage}
            contentFit="cover"
            transition={160}
          />
        ) : (
          <Leaf size={23} color={tint.foreground} strokeWidth={2.2} />
        )}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.commonName}>{row.common_name}</Text>
        <Text style={styles.scientificName} numberOfLines={1}>
          {row.scientific_name}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.actionPrimary} />
      ) : (
        <View style={[styles.check, selected ? styles.checkSelected : null]}>
          {selected ? <Check size={14} color={colors.textOnBrand} strokeWidth={3.2} /> : null}
        </View>
      )}
    </Pressable>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

const AVATAR_TONES = [
  { background: palette.green50, foreground: palette.green700 },
  { background: palette.lime100, foreground: palette.green800 },
  { background: palette.violet50, foreground: palette.violet500 },
  { background: palette.amber50, foreground: palette.green700 },
] as const;

const styles = StyleSheet.create({
  identificationCallout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
    borderWidth: border.width,
    borderColor: palette.violet100,
    backgroundColor: palette.violet50,
  },
  identificationCopy: {
    flex: 1,
    minWidth: 190,
    gap: space[1],
  },
  identificationTitle: {
    ...typography.h4,
    color: colors.textHeading,
  },
  identificationText: {
    ...typography.sm,
    color: colors.textBody,
  },
  identificationButton: {
    width: '100%',
  },
  listBlock: {
    gap: space[3],
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textHeading,
  },
  list: {
    gap: space[2],
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderRadius: radius.lg,
    borderWidth: border.width,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
  },
  rowSelected: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.surfaceBrandSoft,
  },
  rowPressed: {
    opacity: 0.82,
  },
  rowDisabled: {
    opacity: 0.62,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  commonName: {
    ...typography.md,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  scientificName: {
    ...typography.xs,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: border.width,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  stateBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  stateText: {
    ...typography.sm,
    color: colors.textMuted,
  },
  empty: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[8],
    paddingHorizontal: space[5],
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.textHeading,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.sm,
    color: colors.textBody,
    textAlign: 'center',
  },
});
