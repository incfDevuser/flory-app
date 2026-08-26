import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type {
  LightDistance,
  LocationType,
  PotMaterial,
  PotSize,
  RainShelter,
  SunExposure,
  WindowOrientation,
} from '@/lib/plant-vocab';
import { useSession } from '@/lib/session';
import { colors } from '@/theme/tokens';

export type SpeciesChoice = {
  id: string | null;
  commonName: string;
  scientificName: string | null;
  imageUrl: string | null;
  approximate: boolean;
};

export type LastWateredChoice = 'today' | 'few_days' | 'over_week' | 'unknown';

export type OnboardingDraft = {
  species: SpeciesChoice | null;
  identificationAttemptId: string | null;
  location: LocationType | null;
  windowOrientation: WindowOrientation | null;
  lightDistance: LightDistance | null;
  /**
   * «No estoy segura», respondido a propósito.
   *
   * En Postgres no se puede distinguir de «no respondí»: ambos son `null`, y para
   * `compute_interval` los dos valen lo mismo (el valor medio). Estas banderas son
   * solo de UI —para que la opción se vea marcada y sobreviva a la rehidratación del
   * draft— y nunca viajan al RPC.
   */
  windowUnknown: boolean;
  lightUnknown: boolean;
  sunExposure: SunExposure | null;
  rainShelter: RainShelter | null;
  potSize: PotSize | null;
  potMaterial: PotMaterial | null;
  nickname: string;
  lastWateredChoice: LastWateredChoice | null;
};

type DraftContextValue = {
  draft: OnboardingDraft;
  updateDraft: (patch: Partial<OnboardingDraft>) => void;
  setLocation: (location: LocationType) => void;
  clearDraft: () => Promise<void>;
};

type DraftAction =
  | { type: 'hydrate'; draft: OnboardingDraft }
  | { type: 'update'; patch: Partial<OnboardingDraft> }
  | { type: 'location'; location: LocationType }
  | { type: 'reset' };

const INITIAL_DRAFT: OnboardingDraft = {
  species: null,
  identificationAttemptId: null,
  location: null,
  windowOrientation: null,
  lightDistance: null,
  windowUnknown: false,
  lightUnknown: false,
  sunExposure: null,
  rainShelter: null,
  potSize: null,
  potMaterial: null,
  nickname: '',
  lastWateredChoice: null,
};

const DraftContext = createContext<DraftContextValue | null>(null);

function draftReducer(state: OnboardingDraft, action: DraftAction): OnboardingDraft {
  switch (action.type) {
    case 'hydrate':
      return action.draft;
    case 'update':
      return { ...state, ...action.patch };
    case 'location':
      return {
        ...state,
        location: action.location,
        // Los campos del modo anterior no viajan escondidos a Postgres.
        windowOrientation: action.location === 'indoor' ? state.windowOrientation : null,
        lightDistance: action.location === 'indoor' ? state.lightDistance : null,
        windowUnknown: action.location === 'indoor' ? state.windowUnknown : false,
        lightUnknown: action.location === 'indoor' ? state.lightUnknown : false,
        sunExposure: action.location === 'outdoor' ? state.sunExposure : null,
        rainShelter: action.location === 'outdoor' ? state.rainShelter : null,
      };
    case 'reset':
      return INITIAL_DRAFT;
  }
}

/**
 * Draft pequeño y local. SecureStore basta: el JSON queda muy por debajo del límite
 * de 2048 bytes y no justifica sumar AsyncStorage al proyecto.
 */
export function OnboardingDraftProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [draft, dispatch] = useReducer(draftReducer, INITIAL_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const skipNextPersist = useRef(false);
  // Puntos y no dos puntos: SecureStore valida la clave contra /^[\w.-]+$/ y lanza
  // «Invalid key» con cualquier otro carácter. Como los errores de persistencia aquí
  // van con catch, un separador inválido no falla ruidosamente — simplemente deja de
  // guardar el draft sin que nadie se entere.
  const storageKey = userId ? `flory.onboarding.${userId}` : null;

  useEffect(() => {
    let active = true;
    setHydrated(false);

    async function hydrate() {
      if (!storageKey) {
        dispatch({ type: 'reset' });
        if (active) setHydrated(true);
        return;
      }

      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<OnboardingDraft>;
          dispatch({ type: 'hydrate', draft: { ...INITIAL_DRAFT, ...parsed } });
        } else {
          dispatch({ type: 'reset' });
        }
      } catch {
        // Un draft corrupto no puede bloquear el onboarding: se empieza de nuevo.
        dispatch({ type: 'reset' });
      } finally {
        if (active) setHydrated(true);
      }
    }

    hydrate();
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    SecureStore.setItemAsync(storageKey, JSON.stringify(draft)).catch(() => {});
  }, [draft, hydrated, storageKey]);

  async function clearDraft() {
    skipNextPersist.current = true;
    dispatch({ type: 'reset' });
    if (storageKey) await SecureStore.deleteItemAsync(storageKey).catch(() => {});
  }

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.actionPrimary} />
      </View>
    );
  }

  return (
    <DraftContext
      value={{
        draft,
        updateDraft: (patch) => dispatch({ type: 'update', patch }),
        setLocation: (location) => dispatch({ type: 'location', location }),
        clearDraft,
      }}
    >
      {children}
    </DraftContext>
  );
}

export function useOnboardingDraft() {
  const context = use(DraftContext);
  if (!context) throw new Error('useOnboardingDraft debe usarse dentro de OnboardingDraftProvider.');
  return context;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPage,
  },
});
