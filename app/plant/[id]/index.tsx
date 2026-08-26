import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Archive,
  Camera,
  ChevronRight,
  CircleAlert,
  CloudOff,
  Droplets,
  Info,
  Leaf,
  PawPrint,
  Pencil,
  ShieldCheck,
  Sun,
  Thermometer,
  TriangleAlert,
} from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DiagnosisRow } from '@/components/plant/diagnosis-row';
import { EnvironmentSheet, type EnvironmentField } from '@/components/plant/environment-sheet';
import { PlantNameSheet } from '@/components/plant/plant-name-sheet';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FloryMascot, type MascotPose } from '@/components/ui/brand';
import { useHomePlants } from '@/lib/home-plants';
import { useSignedPhotoUrl } from '@/lib/plant-photo';
import { dailyMessage } from '@/lib/plant-messages';
import {
  usePlantDetail,
  usePlantDiagnoses,
  usePlantWaterings,
  type PlantDetail,
  type WateringEvent,
} from '@/lib/plant-detail';
import {
  FROST_LABEL,
  LIGHT_NEED_LABEL,
  OUTDOOR_LABEL,
  STATUS_TONE,
  TOXICITY_COPY,
  type PlantStatus,
} from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useOffline } from '@/lib/use-offline';
import { elapsedLabel, wateringLabel } from '@/lib/watering-copy';
import {
  colors,
  fonts,
  layout,
  palette,
  radius,
  space,
  type as typography,
} from '@/theme/tokens';

const STATUS_LABEL: Record<PlantStatus, string> = {
  bien: 'Estoy bien',
  atencion: 'Necesito atención',
  urgente: 'Necesito agua',
};

const STATUS_POSE: Record<PlantStatus, MascotPose> = {
  bien: 'saluda',
  atencion: 'idea',
  urgente: 'regadera',
};

const FEEDBACK_LABEL: Record<'seca' | 'humeda' | 'empapada', string> = {
  seca: 'Tierra seca',
  humeda: 'Tierra húmeda',
  empapada: 'Tierra empapada',
};

/** Cuántos diagnósticos se muestran en la ficha antes de mandar a la pantalla completa. */
const DIAGNOSES_PREVIEW = 2;

export default function PlantaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useSession();
  const offline = useOffline();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EnvironmentField | null>(null);
  const [editingName, setEditingName] = useState(false);

  const detail = usePlantDetail(id, offline);
  const waterings = usePlantWaterings(id, offline);
  const diagnoses = usePlantDiagnoses(id, offline);

  // Sin conexión la ficha no queda en blanco: el snapshot del Home ya trae nombre,
  // estado y próximo riego, que es lo que se viene a mirar de apuro.
  const { plants: cached } = useHomePlants(userId, offline);
  const fallback = cached.find((plant) => plant.id === id) ?? null;

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('plants').update({ archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.plants(userId ?? 'anon') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.plantCount(userId ?? 'anon') });
      router.back();
    },
    onError: () => {
      Alert.alert('No se pudo archivar', 'Inténtalo de nuevo en un momento.');
    },
  });

  const plant = detail.data ?? null;
  const title = plant?.nickname ?? fallback?.nickname ?? '';
  const photo = useSignedPhotoUrl(plant?.photoPath ?? fallback?.photoPath ?? null);
  const photoUrl = photo.data ?? null;

  const confirmArchive = () => {
    Alert.alert(
      `Archivar a ${title}`,
      'Deja de aparecer en tus plantas y de recibir avisos. Su historial se conserva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => archive.mutate() },
      ]
    );
  };

  if (detail.isPending && !fallback) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={colors.actionPrimary} />
      </View>
    );
  }

  if (!plant && !fallback) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: '' }} />
        <CircleAlert size={30} color={colors.textHeading} strokeWidth={2} />
        <Text style={styles.emptyTitle}>No encontré esta planta</Text>
        <Text style={styles.emptyText}>Puede que la hayas archivado desde otro dispositivo.</Text>
      </View>
    );
  }

  const status: PlantStatus = plant?.status ?? fallback?.status ?? 'bien';
  const tone = STATUS_TONE[status];
  const nextWateringAt = plant?.nextWateringAt ?? fallback?.nextWateringAt ?? null;
  const species = plant?.species ?? null;

  const refreshing = detail.isFetching || waterings.isFetching || diagnoses.isFetching;
  const onRefresh = () => {
    // Sin conexión no hay nada que traer: las queries están deshabilitadas y un refetch
    // solo terminaría en error. El snapshot en pantalla ya es lo último que guardé.
    if (offline) return;
    void detail.refetch();
    void waterings.refetch();
    void diagnoses.refetch();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title }} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.actionPrimary}
            colors={[colors.actionPrimary]}
          />
        }
      >
        {offline ? (
          <Banner
            tone="offline"
            icon={<CloudOff size={18} color={colors.textMuted} strokeWidth={2.2} />}
            message="Estás sin conexión. Te muestro lo último que guardé de esta planta."
          />
        ) : null}

        <View style={styles.hero}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={photoUrl ? `Cambiar foto de ${title}` : `Agregar foto de ${title}`}
            accessibilityState={{ disabled: offline }}
            disabled={offline}
            onPress={() => router.push({ pathname: '/plant/[id]/editar', params: { id } })}
            style={({ pressed }) => [styles.portraitWrap, pressed && styles.pressed]}
          >
            <View style={[styles.portrait, { backgroundColor: tone.soft, borderColor: tone.accent }]}>
              {photoUrl ? (
                <Image
                  source={{ uri: photoUrl }}
                  style={styles.portraitPhoto}
                  contentFit="cover"
                  transition={180}
                  accessibilityLabel={`Foto de ${title}`}
                />
              ) : (
                <FloryMascot pose={STATUS_POSE[status]} height={124} />
              )}
            </View>
            {!offline ? (
              <View style={styles.portraitBadge}>
                <Camera size={15} color={colors.textOnBrand} strokeWidth={2.2} />
              </View>
            ) : null}
          </Pressable>

          <View style={[styles.statusChip, { backgroundColor: tone.soft }]}>
            <View style={[styles.statusDot, { backgroundColor: tone.accent }]} />
            <Text style={styles.statusChipText}>{STATUS_LABEL[status]}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Editar nombre de ${title}`}
            accessibilityState={{ disabled: offline }}
            disabled={offline}
            hitSlop={8}
            onPress={() => setEditingName(true)}
            style={({ pressed }) => [styles.nameButton, pressed && styles.pressed]}
          >
            <Text style={styles.name}>{title}</Text>
            {!offline ? <Pencil size={15} color={colors.textMuted} strokeWidth={2.2} /> : null}
          </Pressable>
          {species?.commonName ? <Text style={styles.speciesName}>{species.commonName}</Text> : null}
          {species?.scientificName ? (
            <Text style={styles.scientific}>{species.scientificName}</Text>
          ) : (
            <Text style={styles.scientific}>Especie por identificar</Text>
          )}
        </View>

        <Text style={styles.message}>{dailyMessage(id, status)}</Text>

        {plant ? (
          <Section title="Mi riego">
            <DataRow label="Ahora riego cada" value={`${plant.currentIntervalDays} días`} />
            <DataRow label="Último riego" value={elapsedLabel(plant.lastWateredAt)} />
            <DataRow label="Próximo riego" value={wateringLabel(plant.nextWateringAt)} last />
          </Section>
        ) : (
          <Section title="Mi riego">
            <DataRow label="Próximo riego" value={wateringLabel(nextWateringAt)} last />
          </Section>
        )}

        {/*
          La toxicidad se muestra siempre, incluso sin especie: no saberlo es un dato en
          sí mismo, y omitir la sección se leería como «no hay problema».
        */}
        <ToxicityCard value={species?.toxicToPets ?? null} />

        {species ? (
          <Section title="Sobre mi especie">
            <IconRow
              icon={<Sun size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
              text={LIGHT_NEED_LABEL[species.lightNeed]}
            />
            <IconRow
              icon={<Leaf size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
              text={OUTDOOR_LABEL[species.suitableOutdoor]}
            />
            <IconRow
              icon={<Thermometer size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
              text={FROST_LABEL[species.frostSensitive]}
              last
            />
          </Section>
        ) : null}

        {species && !species.verifiedCl ? (
          <Banner
            tone="info"
            icon={<Info size={18} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
            message="Todavía estoy aprendiendo sobre mi especie en Chile. Mis tiempos son aproximados."
          />
        ) : null}

        {plant ? (
          <Section title="Mi entorno">
            <EditableRow
              label="Dónde vivo"
              value={plant.location === 'indoor' ? 'Interior' : 'Exterior'}
              onPress={offline ? undefined : () => setEditing('location')}
            />
            {plant.location === 'indoor' ? (
              <>
                <EditableRow
                  label="Sol que me llega"
                  value={describeWindow(plant)}
                  onPress={offline ? undefined : () => setEditing('window_orientation')}
                />
                <EditableRow
                  label="Distancia a la ventana"
                  value={describeLight(plant)}
                  onPress={offline ? undefined : () => setEditing('light_distance')}
                />
              </>
            ) : (
              <>
                <EditableRow
                  label="Sol que recibo"
                  value={plant.sunExposure ? SUN_TEXT[plant.sunExposure] : 'Sin definir'}
                  onPress={offline ? undefined : () => setEditing('sun_exposure')}
                />
                <EditableRow
                  label="Lluvia"
                  value={plant.rainShelter ? RAIN_TEXT[plant.rainShelter] : 'Sin definir'}
                  onPress={offline ? undefined : () => setEditing('rain_shelter')}
                />
              </>
            )}
            <EditableRow
              label="Tamaño de maceta"
              value={plant.potSize ? POT_SIZE_TEXT[plant.potSize] : 'Sin definir'}
              onPress={offline ? undefined : () => setEditing('pot_size')}
            />
            <EditableRow
              label="Material"
              value={plant.potMaterial ? POT_MATERIAL_TEXT[plant.potMaterial] : 'Sin definir'}
              onPress={offline ? undefined : () => setEditing('pot_material')}
              last
            />
          </Section>
        ) : null}

        <Section title="Mis riegos">
          {waterings.isError ? (
            <Placeholder text="No pude cargar mis riegos. Inténtalo de nuevo en un momento." />
          ) : waterings.isPending ? (
            <Placeholder text="Cargando…" />
          ) : (waterings.data ?? []).length === 0 ? (
            <Placeholder text="Todavía no hay riegos registrados." />
          ) : (
            (waterings.data ?? []).map((event, index, list) => (
              <WateringRow key={event.id} event={event} last={index === list.length - 1} />
            ))
          )}
        </Section>

        <Section title="Mis diagnósticos">
          <View style={styles.diagnoseCta}>
            <Button
              label="¿Cómo me ves?"
              size="md"
              onPress={() =>
                router.push({ pathname: '/diagnostico/camara', params: { plantId: id } })
              }
              disabled={offline}
              leadingIcon={<Camera size={19} color={colors.textOnBrand} strokeWidth={2.2} />}
            />
          </View>
          {diagnoses.isError ? (
            <Placeholder text="No pude cargar mis diagnósticos. Inténtalo de nuevo en un momento." />
          ) : diagnoses.isPending ? (
            <Placeholder text="Cargando…" />
          ) : (diagnoses.data ?? []).length === 0 ? (
            <Placeholder text="Todavía no me has revisado con una foto." />
          ) : (
            <>
              {/* Solo los más recientes; el historial completo vive en su pantalla. */}
              {(diagnoses.data ?? []).slice(0, DIAGNOSES_PREVIEW).map((entry, index, list) => {
                const isLastPreview = index === list.length - 1;
                const hasMore = (diagnoses.data ?? []).length > DIAGNOSES_PREVIEW;
                return (
                  <DiagnosisRow
                    key={entry.id}
                    entry={entry}
                    last={isLastPreview && !hasMore}
                  />
                );
              })}
              {(diagnoses.data ?? []).length > DIAGNOSES_PREVIEW ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ver todos mis diagnósticos"
                  onPress={() =>
                    router.push({ pathname: '/plant/[id]/diagnosticos', params: { id } })
                  }
                  style={({ pressed }) => [styles.viewAll, pressed && styles.pressedRow]}
                >
                  <Text style={styles.viewAllLabel}>Ver todos mis diagnósticos</Text>
                  <ChevronRight size={17} color={colors.textFaint} strokeWidth={2.2} />
                </Pressable>
              ) : null}
            </>
          )}
        </Section>

        {species && species.commonProblems.length > 0 ? (
          <Section title="Lo que suele pasarme">
            {species.commonProblems.map((problem, index) => (
              <IconRow
                key={problem}
                icon={<Leaf size={17} color={colors.actionPrimaryHover} strokeWidth={2.2} />}
                text={capitalizeInitial(problem)}
                last={index === species.commonProblems.length - 1}
              />
            ))}
          </Section>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: archive.isPending || offline }}
          disabled={archive.isPending || offline}
          onPress={confirmArchive}
          style={({ pressed }) => [styles.archive, pressed && styles.pressed]}
        >
          <Archive size={19} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.archiveLabel}>
            {archive.isPending
              ? 'Archivando…'
              : offline
                ? 'Conéctate para archivar'
                : 'Archivar planta'}
          </Text>
        </Pressable>
      </ScrollView>

      {editing && plant && userId ? (
        <EnvironmentSheet
          plant={plant}
          field={editing}
          userId={userId}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editingName && plant && userId ? (
        <PlantNameSheet
          plantId={plant.id}
          currentName={plant.nickname}
          userId={userId}
          onClose={() => setEditingName(false)}
        />
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function DataRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.dataRow, !last && styles.divider]}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function EditableRow({
  label,
  value,
  onPress,
  note,
  last,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  note?: string;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dataRow,
        !last && styles.divider,
        pressed && onPress && styles.pressedRow,
      ]}
    >
      <View style={styles.editableCopy}>
        <Text style={styles.dataLabel}>{label}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <View style={styles.editableValue}>
        <Text style={styles.dataValue}>{value}</Text>
        {onPress ? <ChevronRight size={17} color={colors.textFaint} strokeWidth={2.2} /> : null}
      </View>
    </Pressable>
  );
}

function IconRow({ icon, text, last }: { icon: ReactNode; text: string; last?: boolean }) {
  return (
    <View style={[styles.iconRow, !last && styles.divider]}>
      {icon}
      <Text style={styles.iconRowText}>{text}</Text>
    </View>
  );
}

function ToxicityCard({ value }: { value: 'si' | 'no' | 'no_listado_aspca' | null }) {
  const copy = TOXICITY_COPY[value ?? 'sin_especie'];

  const icon =
    copy.tone === 'warning' ? (
      <TriangleAlert size={20} color={palette.ink700} strokeWidth={2.2} />
    ) : copy.tone === 'safe' ? (
      <ShieldCheck size={20} color={colors.actionPrimaryHover} strokeWidth={2.2} />
    ) : (
      <PawPrint size={20} color={colors.textMuted} strokeWidth={2.2} />
    );

  const background =
    copy.tone === 'warning'
      ? colors.statusAtencionSoft
      : copy.tone === 'safe'
        ? colors.surfaceBrandSoft
        : colors.surfaceSunken;

  return (
    <View style={[styles.toxicity, { backgroundColor: background }]}>
      {icon}
      <Text style={styles.toxicityText}>{copy.text}</Text>
    </View>
  );
}

function WateringRow({ event, last }: { event: WateringEvent; last: boolean }) {
  const adjusted =
    event.intervalBefore !== null &&
    event.intervalAfter !== null &&
    event.intervalBefore !== event.intervalAfter;

  return (
    <View style={[styles.historyRow, !last && styles.divider]}>
      <View style={styles.historyIcon}>
        <Droplets size={17} color={colors.actionPrimaryHover} strokeWidth={2.2} />
      </View>
      <View style={styles.historyCopy}>
        <Text style={styles.historyTitle}>
          {event.source === 'rain' ? 'Me regó la lluvia' : 'Riego registrado'}
        </Text>
        <Text style={styles.historyNote}>
          {event.feedback ? FEEDBACK_LABEL[event.feedback] : 'Sin revisar la tierra'}
          {adjusted ? ` · pasé a ${event.intervalAfter} días` : ''}
        </Text>
      </View>
      <Text style={styles.historyWhen}>{elapsedLabel(event.wateredAt)}</Text>
    </View>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

function capitalizeInitial(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : '';
}

const SUN_TEXT: Record<string, string> = {
  sol_todo_dia: 'Todo el día',
  sol_manana: 'Solo mañana',
  sol_tarde: 'Solo tarde',
  sombra_parcial: 'Semisombra',
  sombra: 'Sombra',
};

const RAIN_TEXT: Record<string, string> = {
  descubierta: 'Descubierta',
  alero: 'Bajo alero',
  techada: 'Techada',
};

const POT_SIZE_TEXT: Record<string, string> = {
  chica: 'Chica',
  media: 'Media',
  grande: 'Grande',
};

const POT_MATERIAL_TEXT: Record<string, string> = {
  plastico: 'Plástico',
  greda: 'Greda',
  ceramica: 'Cerámica',
  otro: 'Otro',
};

/**
 * Se devuelve el horario observable, no el punto cardinal.
 *
 * El mapeo horario→orientación es una inferencia nuestra (lib/plant-vocab.ts). Mostrar
 * «Norte» sería presentar como dato confirmado algo que nadie verificó.
 */
function describeWindow(plant: PlantDetail): string {
  switch (plant.windowOrientation) {
    case 'este':
      return 'Por la mañana';
    case 'oeste':
      return 'Por la tarde';
    case 'norte':
      return 'Casi todo el día';
    case 'sur':
      return 'Casi nunca directo';
    case 'sin_ventana':
      return 'Sin ventana cerca';
    default:
      return 'Sin definir';
  }
}

function describeLight(plant: PlantDetail): string {
  switch (plant.lightDistance) {
    case 'junto_ventana':
      return 'Junto a la ventana';
    case 'cerca':
      return 'Cerca';
    case 'lejos':
      return 'Lejos';
    default:
      return 'Sin definir';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgPage,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bgPage,
  },
  content: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[16],
    gap: space[5],
  },
  hero: {
    alignItems: 'center',
    gap: space[2],
  },
  portraitWrap: {
    width: 156,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portrait: {
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portraitPhoto: {
    width: '100%',
    height: '100%',
  },
  portraitBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionPrimary,
    borderWidth: 2,
    borderColor: colors.surfaceCard,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    height: 32,
    borderRadius: radius.pill,
    marginTop: space[1],
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  statusChipText: {
    ...typography.xs,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  name: {
    ...typography.h2,
    lineHeight: 38,
    minHeight: 40,
    color: colors.textHeading,
    textAlign: 'center',
  },
  nameButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
  },
  speciesName: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textBody,
    textAlign: 'center',
  },
  scientific: {
    ...typography.xs,
    fontStyle: 'italic',
    color: colors.textMuted,
    textAlign: 'center',
  },
  message: {
    ...typography.lg,
    color: colors.textBody,
    textAlign: 'center',
  },
  section: {
    gap: space[2],
  },
  sectionTitle: {
    ...typography.eyebrow,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: space[1],
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
  },
  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: colors.borderSubtle,
  },
  dataRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  pressedRow: {
    backgroundColor: colors.surfaceSunken,
  },
  editableCopy: {
    flex: 1,
    gap: 1,
  },
  editableValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  dataLabel: {
    ...typography.sm,
    color: colors.textMuted,
  },
  dataValue: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
    textAlign: 'right',
  },
  rowNote: {
    ...typography.xs,
    color: colors.textFaint,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  iconRowText: {
    ...typography.sm,
    flex: 1,
    color: colors.textBody,
  },
  toxicity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    borderRadius: radius.lg,
  },
  toxicityText: {
    ...typography.sm,
    flex: 1,
    fontFamily: fonts.bodySemibold,
    color: colors.textHeading,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceBrandSoft,
  },
  historyCopy: {
    flex: 1,
    gap: 1,
  },
  historyTitle: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textHeading,
  },
  historyNote: {
    ...typography.xs,
    color: colors.textMuted,
  },
  historyWhen: {
    ...typography.xs,
    color: colors.textFaint,
  },
  diagnoseCta: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
    paddingBottom: space[3],
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: 1.5,
    borderTopColor: colors.borderSubtle,
  },
  viewAllLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.actionPrimaryHover,
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
  archive: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    marginTop: space[2],
  },
  archiveLabel: {
    ...typography.sm,
    fontFamily: fonts.bodyBold,
    color: colors.textMuted,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textHeading,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
