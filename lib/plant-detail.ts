import { useQuery } from '@tanstack/react-query';

import type {
  LightDistance,
  LocationType,
  PlantStatus,
  PotMaterial,
  PotSize,
  RainShelter,
  SunExposure,
  WindowOrientation,
} from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/**
 * Datos de la ficha completa.
 *
 * Se lee `plants` directo en vez de `plant_summary(uuid)`: ese RPC devuelve un
 * subconjunto (nombre, especie, estado, días, intervalo) y obligaría a una segunda
 * consulta para el entorno y la ficha de especie. Con el FK a `species` PostgREST
 * incrusta la especie en la misma llamada, y RLS ya limita la fila a su dueño.
 */

export type PlantDetail = {
  id: string;
  nickname: string;
  photoPath: string | null;
  status: PlantStatus;
  active: boolean;
  location: LocationType;
  windowOrientation: WindowOrientation | null;
  lightDistance: LightDistance | null;
  sunExposure: SunExposure | null;
  rainShelter: RainShelter | null;
  potSize: PotSize | null;
  potMaterial: PotMaterial | null;
  currentIntervalDays: number;
  lastWateredAt: string | null;
  nextWateringAt: string | null;
  createdAt: string | null;
  species: {
    id: string;
    commonName: string;
    scientificName: string;
    lightNeed: 'baja' | 'media' | 'alta';
    suitableOutdoor: 'no' | 'semisombra_protegida' | 'si';
    frostSensitive: 'si' | 'parcial' | 'no';
    toxicToPets: 'si' | 'no' | 'no_listado_aspca';
    /**
     * Cadenas simples, no objetos.
     *
     * `tables.sql:205` documenta `[{sintoma, causa, accion}]`, pero lo que cargó
     * `species_feed.sql` en las 206 especies son frases sueltas. Manda el dato real.
     */
    commonProblems: string[];
    verifiedCl: boolean;
  } | null;
};

export type WateringEvent = {
  id: string;
  wateredAt: string;
  feedback: 'seca' | 'humeda' | 'empapada' | null;
  intervalBefore: number | null;
  intervalAfter: number | null;
  source: string | null;
};

export type DiagnosisEntry = {
  id: string;
  createdAt: string;
  cause: string | null;
  confidence: 'alta' | 'media' | 'baja' | null;
  severity: PlantStatus | null;
  symptomTag: string | null;
  floryMessage: string | null;
};

/** Ficha completa de un diagnóstico, para la pantalla de resultado. */
export type DiagnosisDetail = {
  id: string;
  plantId: string | null;
  createdAt: string;
  symptomTag: string | null;
  cause: string | null;
  confidence: 'alta' | 'media' | 'baja' | null;
  action: string | null;
  timeframe: string | null;
  notRecoverable: string | null;
  severity: PlantStatus | null;
  floryMessage: string | null;
  adjustIntervalDays: number | null;
  followupAt: string | null;
  userAction: string | null;
  imagePath: string | null;
};

const DIAGNOSIS_SELECT =
  'id, plant_id, created_at, symptom_tag, cause, confidence, action, timeframe, not_recoverable, severity, flory_message, adjust_interval_days, followup_at, user_action, image_path';

type DiagnosisRow = {
  id: string;
  plant_id: string | null;
  created_at: string;
  symptom_tag: string | null;
  cause: string | null;
  confidence: 'alta' | 'media' | 'baja' | null;
  action: string | null;
  timeframe: string | null;
  not_recoverable: string | null;
  severity: PlantStatus | null;
  flory_message: string | null;
  adjust_interval_days: number | null;
  followup_at: string | null;
  user_action: string | null;
  image_path: string | null;
};

export function toDiagnosisDetail(row: DiagnosisRow): DiagnosisDetail {
  return {
    id: row.id,
    plantId: row.plant_id,
    createdAt: row.created_at,
    symptomTag: row.symptom_tag,
    cause: row.cause,
    confidence: row.confidence,
    action: row.action,
    timeframe: row.timeframe,
    notRecoverable: row.not_recoverable,
    severity: row.severity,
    floryMessage: row.flory_message,
    adjustIntervalDays: row.adjust_interval_days,
    followupAt: row.followup_at,
    userAction: row.user_action,
    imagePath: row.image_path,
  };
}

export function useDiagnosisDetail(diagnosisId: string) {
  return useQuery({
    queryKey: queryKeys.diagnosis(diagnosisId),
    queryFn: async (): Promise<DiagnosisDetail | null> => {
      const { data, error } = await supabase
        .from('diagnoses')
        .select(DIAGNOSIS_SELECT)
        .eq('id', diagnosisId)
        .maybeSingle();

      if (error) throw error;
      return data ? toDiagnosisDetail(data as DiagnosisRow) : null;
    },
  });
}

const PLANT_SELECT = `
  id,
  nickname,
  photo_url,
  status,
  active,
  location,
  window_orientation,
  light_distance,
  sun_exposure,
  rain_shelter,
  pot_size,
  pot_material,
  current_interval_days,
  last_watered_at,
  next_watering_at,
  created_at,
  species:species_id (
    id,
    common_name,
    scientific_name,
    light_need,
    suitable_outdoor,
    frost_sensitive,
    toxic_to_pets,
    common_problems,
    verified_cl
  )
`;

/** El historial es una lista, nunca un gráfico (FlorySpec §418). */
const HISTORY_LIMIT = 20;

export function usePlantDetail(plantId: string, offline: boolean) {
  return useQuery({
    queryKey: queryKeys.plantDetail(plantId),
    enabled: !offline,
    queryFn: async (): Promise<PlantDetail | null> => {
      const { data, error } = await supabase
        .from('plants')
        .select(PLANT_SELECT)
        .eq('id', plantId)
        .maybeSingle();

      if (error) throw error;
      return data ? toPlantDetail(data as PlantRow) : null;
    },
  });
}

export function usePlantWaterings(plantId: string, offline: boolean) {
  return useQuery({
    queryKey: queryKeys.plantWaterings(plantId),
    enabled: !offline,
    queryFn: async (): Promise<WateringEvent[]> => {
      const { data, error } = await supabase
        .from('watering_events')
        .select('id, watered_at, feedback, interval_before, interval_after, source')
        .eq('plant_id', plantId)
        .order('watered_at', { ascending: false })
        .limit(HISTORY_LIMIT);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id as string,
        wateredAt: row.watered_at as string,
        feedback: row.feedback as WateringEvent['feedback'],
        intervalBefore: row.interval_before as number | null,
        intervalAfter: row.interval_after as number | null,
        source: row.source as string | null,
      }));
    },
  });
}

/** Preview de la ficha: los más recientes. La lista completa vive en su propia pantalla. */
const DIAGNOSES_PREVIEW_LIMIT = 10;
/** Pantalla dedicada `plant/[id]/diagnosticos`: el historial entero (con tope sano). */
const DIAGNOSES_FULL_LIMIT = 50;

async function fetchDiagnoses(plantId: string, limit: number): Promise<DiagnosisEntry[]> {
  // `image_path` no se pide: el bucket es privado y necesitaría URL firmada, que
  // llega con el bloque de fotos. Sin eso, traerla solo sería peso muerto.
  const { data, error } = await supabase
    .from('diagnoses')
    .select('id, created_at, cause, confidence, severity, symptom_tag, flory_message')
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    cause: row.cause as string | null,
    confidence: row.confidence as DiagnosisEntry['confidence'],
    severity: row.severity as PlantStatus | null,
    symptomTag: row.symptom_tag as string | null,
    floryMessage: row.flory_message as string | null,
  }));
}

export function usePlantDiagnoses(plantId: string, offline: boolean) {
  return useQuery({
    queryKey: queryKeys.plantDiagnoses(plantId),
    enabled: !offline,
    queryFn: () => fetchDiagnoses(plantId, DIAGNOSES_PREVIEW_LIMIT),
  });
}

export function usePlantDiagnosesAll(plantId: string, offline: boolean) {
  return useQuery({
    queryKey: queryKeys.plantDiagnosesAll(plantId),
    enabled: !offline,
    queryFn: () => fetchDiagnoses(plantId, DIAGNOSES_FULL_LIMIT),
  });
}

type SpeciesRow = {
  id: string;
  common_name: string;
  scientific_name: string;
  light_need: 'baja' | 'media' | 'alta';
  suitable_outdoor: 'no' | 'semisombra_protegida' | 'si';
  frost_sensitive: 'si' | 'parcial' | 'no';
  toxic_to_pets: 'si' | 'no' | 'no_listado_aspca';
  common_problems: unknown;
  verified_cl: boolean | null;
};

type PlantRow = {
  id: string;
  nickname: string;
  photo_url: string | null;
  status: PlantStatus | null;
  active: boolean | null;
  location: LocationType;
  window_orientation: WindowOrientation | null;
  light_distance: LightDistance | null;
  sun_exposure: SunExposure | null;
  rain_shelter: RainShelter | null;
  pot_size: PotSize | null;
  pot_material: PotMaterial | null;
  current_interval_days: number;
  last_watered_at: string | null;
  next_watering_at: string | null;
  created_at: string | null;
  species: SpeciesRow | SpeciesRow[] | null;
};

function toPlantDetail(row: PlantRow): PlantDetail {
  const relation = Array.isArray(row.species) ? row.species[0] : row.species;

  return {
    id: row.id,
    nickname: row.nickname,
    photoPath: row.photo_url,
    status: row.status ?? 'bien',
    active: row.active ?? true,
    location: row.location,
    windowOrientation: row.window_orientation,
    lightDistance: row.light_distance,
    sunExposure: row.sun_exposure,
    rainShelter: row.rain_shelter,
    potSize: row.pot_size,
    potMaterial: row.pot_material,
    currentIntervalDays: row.current_interval_days,
    lastWateredAt: row.last_watered_at,
    nextWateringAt: row.next_watering_at,
    createdAt: row.created_at,
    species: relation
      ? {
          id: relation.id,
          commonName: relation.common_name,
          scientificName: relation.scientific_name,
          lightNeed: relation.light_need,
          suitableOutdoor: relation.suitable_outdoor,
          frostSensitive: relation.frost_sensitive,
          toxicToPets: relation.toxic_to_pets,
          commonProblems: toProblemList(relation.common_problems),
          verifiedCl: relation.verified_cl ?? false,
        }
      : null,
  };
}

/**
 * El catálogo trae cadenas, pero el esquema promete objetos. Se aceptan las dos formas
 * para que una corrección futura del feed no rompa la pantalla.
 */
function toProblemList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'sintoma' in item) {
        return String((item as { sintoma: unknown }).sintoma);
      }
      return '';
    })
    .filter((item) => item.trim().length > 0);
}
