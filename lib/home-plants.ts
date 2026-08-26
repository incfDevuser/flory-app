import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import type { PlantStatus } from '@/lib/plant-vocab';
import { queryKeys } from '@/lib/query';
import { chunkedSecureStore, supabase } from '@/lib/supabase';

export type { PlantStatus };

export type HomePlant = {
  id: string;
  nickname: string;
  /** Ruta privada dentro del bucket `plant-photos`, no una URL. Se firma para mostrarla. */
  photoPath: string | null;
  status: PlantStatus;
  nextWateringAt: string | null;
  currentIntervalDays: number;
  potSize: string | null;
  potMaterial: string | null;
  /**
   * `false` = congelada por bajar de plan. La planta y su historial siguen intactos;
   * solo deja de participar del riego (tables.sql:277). Se muestra, nunca se oculta.
   */
  active: boolean;
  species: {
    commonName: string;
    scientificName: string;
    verifiedCl: boolean;
  } | null;
};

type PlantRow = {
  id: string;
  nickname: string;
  photo_url: string | null;
  status: PlantStatus | null;
  next_watering_at: string | null;
  current_interval_days: number;
  pot_size: string | null;
  pot_material: string | null;
  active: boolean | null;
  species:
    | {
        common_name: string;
        scientific_name: string;
        verified_cl: boolean | null;
      }
    | {
        common_name: string;
        scientific_name: string;
        verified_cl: boolean | null;
      }[]
    | null;
};

/**
 * El separador es un punto: SecureStore rechaza cualquier clave que no calce con
 * /^[\w.-]+$/, y como la caché falla en silencio, unos dos puntos aquí dejarían la
 * app sin modo sin conexión sin dar ninguna señal.
 */
const CACHE_PREFIX = 'flory.home-plants.';

export function useHomePlants(userId: string | null, offline: boolean) {
  const cache = useQuery({
    queryKey: ['home-plants-cache', userId],
    enabled: userId !== null,
    staleTime: Infinity,
    queryFn: () => readCache(userId!),
  });

  const remote = useQuery({
    queryKey: queryKeys.plants(userId ?? 'anon'),
    enabled: userId !== null && !offline,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plants')
        .select(`
          id,
          nickname,
          photo_url,
          status,
          next_watering_at,
          current_interval_days,
          pot_size,
          pot_material,
          active,
          species:species_id (
            common_name,
            scientific_name,
            verified_cl
          )
        `)
        .eq('archived', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const plants = ((data ?? []) as PlantRow[]).map(toHomePlant);
      await writeCache(userId!, plants);
      return plants;
    },
  });

  return {
    plants: remote.data ?? cache.data ?? [],
    isLoading: remote.isPending && cache.isPending,
    isError: remote.isError && cache.data === null,
    isFromCache: remote.isError && cache.data !== null && cache.data !== undefined,
    isFetching: remote.isFetching,
    refetch: remote.refetch,
  };
}

function toHomePlant(row: PlantRow): HomePlant {
  const relation = Array.isArray(row.species) ? row.species[0] : row.species;
  return {
    id: row.id,
    nickname: row.nickname,
    photoPath: row.photo_url,
    status: row.status ?? 'bien',
    nextWateringAt: row.next_watering_at,
    currentIntervalDays: row.current_interval_days,
    potSize: row.pot_size,
    potMaterial: row.pot_material,
    // El default de la columna es `true`; un null solo aparecería en filas antiguas.
    active: row.active ?? true,
    species: relation
      ? {
          commonName: relation.common_name,
          scientificName: relation.scientific_name,
          verifiedCl: relation.verified_cl ?? false,
        }
      : null,
  };
}

async function readCache(userId: string): Promise<HomePlant[] | null> {
  if (Platform.OS === 'web') return null;
  try {
    const value = await chunkedSecureStore.getItem(`${CACHE_PREFIX}${userId}`);
    return value ? (JSON.parse(value) as HomePlant[]) : null;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, plants: HomePlant[]): Promise<void> {
  if (Platform.OS === 'web') return;
  await chunkedSecureStore.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(plants)).catch(() => {});
}
