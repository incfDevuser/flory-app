import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { prepareAiImage } from '@/lib/plant-photo';
import { supabase } from '@/lib/supabase';
import type { PlantStatus } from '@/lib/plant-vocab';

/**
 * Puente del cliente a las Edge Functions de identificación y diagnóstico.
 *
 * La foto se manda en base64 dentro del cuerpo; la función hace hash, dedupe, subida,
 * firma y modelo (INTEGRACION_IA.MD §2). El cliente nunca ve la llave de OpenAI ni la
 * service_role: solo su JWT de sesión viaja como Bearer.
 */

export type DiagnosisRow = {
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

export type DiagnoseErrorKind =
  | 'timeout'
  | 'content_filter'
  | 'invalid_image_format'
  | 'image_too_large'
  | 'quota'
  | 'offline'
  | 'no_session'
  | 'not_found'
  | 'artificial'
  | 'flores_cortadas'
  | 'no_es_planta'
  | 'multiples_plantas'
  | 'foto_ilegible'
  | 'especie_no_coincide'
  | 'planta_no_coincide'
  | 'generic';

export type DiagnoseResult =
  | { ok: true; deduped: boolean; diagnosis: DiagnosisRow }
  | { ok: false; kind: DiagnoseErrorKind; message: string; resetsOn?: string | null };

export type IdentificationConfidence = 'alta' | 'media' | 'baja';

export type IdentificationNonPlantKind =
  | 'artificial'
  | 'flores_cortadas'
  | 'planta_muerta'
  | 'no_es_planta'
  | 'multiples_plantas'
  | 'foto_ilegible';

export type IdentificationCareArchetype =
  | 'helecho_humedo'
  | 'marantacea'
  | 'aroide_sediento'
  | 'tropical_medio'
  | 'lenosa_interior'
  | 'semisuculenta'
  | 'suculenta_hoja'
  | 'suculenta_dura'
  | 'cactus'
  | 'ext_flor'
  | 'ext_mediterranea'
  | 'ext_arbustiva'
  | 'ext_nativa_seca'
  | 'ext_citrico'
  | 'manual_v1';

export type IdentificationPlantCategory =
  | 'interior'
  | 'exterior_maceta'
  | 'suculenta_cactus';

export type IdentificationCatalogSpecies = {
  id: string;
  scientificName: string;
  commonName: string;
  confidence: IdentificationConfidence;
  alternatives: string[];
  floryMessage: string;
};

export type IdentificationProposal = {
  scientificName: string;
  commonName: string;
  careArchetype: IdentificationCareArchetype;
  category: IdentificationPlantCategory;
  confidence: IdentificationConfidence;
  alternatives: string[];
  floryMessage: string;
};

type IdentificationSuccessBase = {
  ok: true;
  attemptId: string;
  imagePath: string;
  deduped: boolean;
};

export type IdentificationSuccess =
  | (IdentificationSuccessBase & {
      nonPlant: { kind: IdentificationNonPlantKind; floryMessage: string };
      catalogSpecies?: never;
      proposal?: never;
    })
  | (IdentificationSuccessBase & {
      nonPlant?: never;
      catalogSpecies: IdentificationCatalogSpecies;
      proposal?: never;
    })
  | (IdentificationSuccessBase & {
      nonPlant?: never;
      catalogSpecies?: never;
      proposal: IdentificationProposal;
    });

export type IdentifyErrorKind =
  | 'timeout'
  | 'content_filter'
  | 'invalid_image_format'
  | 'image_too_large'
  | 'offline'
  | 'no_session'
  | 'generic';

export type IdentifyResult =
  | IdentificationSuccess
  | { ok: false; kind: IdentifyErrorKind; message: string };

export type IdentificationUserAction = 'confirmo' | 'corrigio' | 'no_sabe' | 'abandono';

export type ResolvedIdentificationSpecies = {
  id: string;
  scientificName: string;
  commonName: string;
  aliases: string[];
  category: string;
  careArchetype: string | null;
  baseWateringDays: number;
  minWateringDays: number;
  maxWateringDays: number;
  lightNeed: string;
  verified: boolean;
  approximate: boolean;
};

export type IdentificationResolution = {
  resolved: boolean;
  userAction: IdentificationUserAction;
  species: ResolvedIdentificationSpecies | null;
};

export type IdentificationPhotoAttachment = {
  attached: boolean;
  status: 'attached' | 'already_attached' | 'photo_exists';
  imagePath: string | null;
};

/**
 * Copia con voz de Flory para cada caso de error (INTEGRACION_IA.MD §5). Primera persona,
 * sin culpar, sin muro comercial en el cupo.
 */
const ERROR_COPY: Record<Exclude<DiagnoseErrorKind, 'quota'>, string> = {
  timeout: 'Me está costando verme. ¿Probamos de nuevo?',
  content_filter: 'No pude mirar bien esta foto. ¿Me tomas otra con buena luz?',
  invalid_image_format: 'Esa foto no la pude abrir. ¿Me tomas otra?',
  image_too_large: 'Esa foto pesa demasiado. ¿Me tomas otra?',
  offline: 'Estás sin conexión. Guardo las ganas y lo vemos cuando vuelvas a tener red.',
  no_session: 'Se cerró tu sesión. Vuelve a entrar y te miro.',
  not_found: 'No encuentro esta planta. Vuelve a abrir mi ficha e inténtalo de nuevo.',
  artificial:
    'Esa foto no parece ser mía: veo una planta artificial. ¿Me muestras a la planta de esta ficha?',
  flores_cortadas:
    'Veo flores cortadas, no una planta en su maceta. ¿Me muestras a la planta de esta ficha?',
  no_es_planta: 'No encuentro una planta en esta foto. ¿Me tomas otra donde salga solo yo?',
  multiples_plantas:
    'Veo más de una planta y no sé cuál soy. ¿Me tomas otra donde salga solo yo?',
  foto_ilegible: 'No logro verme bien. ¿Probamos de cerca y con más luz?',
  especie_no_coincide:
    'La planta de esta foto no parece ser de mi especie. ¿Me muestras a la planta de esta ficha?',
  planta_no_coincide:
    'Esta foto no parece ser mía. ¿Me tomas otra donde salga solo la planta de esta ficha?',
  generic: 'Algo se me enredó al mirarme. ¿Lo intentamos otra vez?',
};

const IDENTIFY_ERROR_COPY: Record<IdentifyErrorKind, string> = {
  timeout: 'Me está costando reconocerme. ¿Probamos de nuevo?',
  content_filter: 'No pude mirar bien esta foto. ¿Me tomas otra con buena luz?',
  invalid_image_format: 'Esa foto no la pude abrir. ¿Me tomas otra?',
  image_too_large: 'Esa foto pesa demasiado. ¿Me tomas otra?',
  offline: 'Estoy sin conexión. Dejemos esta foto lista y lo intento cuando vuelva la red.',
  no_session: 'Se cerró tu sesión. Vuelve a entrar para que pueda reconocerme.',
  generic: 'Algo se me enredó al reconocerme. ¿Lo intentamos otra vez?',
};

const RESOLVE_ERROR_COPY = 'No pude guardar tu elección. Inténtalo de nuevo en un momento.';
const RESOLVE_OFFLINE_COPY = 'No pude guardar tu elección porque estoy sin conexión.';
const RESOLVE_SESSION_COPY = 'No pude guardar tu elección porque se cerró tu sesión.';
const ATTACH_ERROR_COPY = 'No pude guardar la foto de identificación.';

/** Mensaje de cupo agotado, con la fecha en que vuelve. Sin números crudos ni paywall. */
function quotaMessage(resetsOn: string | null | undefined): string {
  if (!resetsOn) return 'Ya me miré varias veces. Descanso un poco y volvemos pronto.';
  const date = new Date(resetsOn);
  const label = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
  return `Ya me miré varias veces este mes. Vuelvo el ${label}.`;
}

export async function diagnosePlant(params: {
  plantId: string;
  localUri: string;
  width?: number;
  height?: number;
}): Promise<DiagnoseResult> {
  const { plantId, localUri, width, height } = params;

  let imageBase64: string;
  try {
    imageBase64 = await prepareAiImage({ localUri, width, height });
  } catch {
    return { ok: false, kind: 'generic', message: ERROR_COPY.generic };
  }

  const { data, error } = await supabase.functions.invoke('diagnose', {
    body: { plantId, imageBase64 },
  });

  if (error) {
    // Sin red: el fetch ni siquiera llegó.
    if (error instanceof FunctionsFetchError) {
      return { ok: false, kind: 'offline', message: ERROR_COPY.offline };
    }
    // Errores HTTP (401/404/500…). Se intenta leer el `error` del cuerpo.
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => ({}));
      return toError(body?.error, body?.resetsOn, body?.reason);
    }
    return { ok: false, kind: 'generic', message: ERROR_COPY.generic };
  }

  // Errores de nivel app que la función devuelve con 200 y `{ error }`.
  if (data?.error) return toError(data.error, data.resetsOn, data.reason);

  if (data?.diagnosis) {
    return { ok: true, deduped: Boolean(data.deduped), diagnosis: data.diagnosis as DiagnosisRow };
  }

  return { ok: false, kind: 'generic', message: ERROR_COPY.generic };
}

export async function identifyPlant(
  localUri: string,
  width?: number,
  height?: number
): Promise<IdentifyResult> {
  let imageBase64: string;
  try {
    imageBase64 = await prepareAiImage({ localUri, width, height });
  } catch {
    return identifyError('generic');
  }

  try {
    const { data, error } = await supabase.functions.invoke('identify', {
      body: { imageBase64 },
    });

    if (error) {
      if (error instanceof FunctionsFetchError) return identifyError('offline');
      if (error instanceof FunctionsHttpError) {
        const body = await readFunctionErrorBody(error);
        return identifyErrorFromCode(body.error, error.context?.status);
      }
      return identifyError('generic');
    }

    if (isRecord(data) && data.error) return identifyErrorFromCode(data.error);
    const parsed = parseIdentificationSuccess(data);
    return parsed ?? identifyError('generic');
  } catch (error) {
    return identifyError(error instanceof FunctionsFetchError ? 'offline' : 'generic');
  }
}

export async function resolveIdentification(
  attemptId: string,
  userAction: IdentificationUserAction,
  selectedSpeciesId?: string
): Promise<IdentificationResolution> {
  try {
    const { data, error } = await supabase.functions.invoke('confirm-identification', {
      body: {
        operation: 'resolve',
        attemptId,
        userAction,
        ...(selectedSpeciesId ? { selectedSpeciesId } : {}),
      },
    });

    if (error) throw await resolutionError(error);
    if (isRecord(data) && data.error) throw resolveErrorFromCode(data.error);

    const parsed = parseIdentificationResolution(data);
    if (!parsed) throw new Error(RESOLVE_ERROR_COPY);
    return parsed;
  } catch (error) {
    if (error instanceof Error && isStableResolutionMessage(error.message)) throw error;
    throw new Error(error instanceof FunctionsFetchError ? RESOLVE_OFFLINE_COPY : RESOLVE_ERROR_COPY);
  }
}

export async function attachIdentificationPhoto(
  attemptId: string,
  plantId: string
): Promise<IdentificationPhotoAttachment> {
  try {
    const { data, error } = await supabase.functions.invoke('confirm-identification', {
      body: { operation: 'attach_photo', attemptId, plantId },
    });

    if (error || (isRecord(data) && data.error)) throw new Error(ATTACH_ERROR_COPY);
    const parsed = parsePhotoAttachment(data);
    if (!parsed) throw new Error(ATTACH_ERROR_COPY);
    return parsed;
  } catch {
    throw new Error(ATTACH_ERROR_COPY);
  }
}

function toError(
  code: unknown,
  resetsOn?: string | null,
  validationReason?: unknown
): DiagnoseResult {
  if (code === 'quota') {
    return { ok: false, kind: 'quota', message: quotaMessage(resetsOn), resetsOn: resetsOn ?? null };
  }
  if (code === 'validation_failed' && isValidationReason(validationReason)) {
    return {
      ok: false,
      kind: validationReason,
      message: ERROR_COPY[validationReason],
    };
  }
  const kind = isKnownKind(code) ? code : 'generic';
  return { ok: false, kind, message: ERROR_COPY[kind as Exclude<DiagnoseErrorKind, 'quota'>] };
}

const VALIDATION_REASONS = [
  'artificial',
  'flores_cortadas',
  'no_es_planta',
  'multiples_plantas',
  'foto_ilegible',
  'especie_no_coincide',
  'planta_no_coincide',
] as const;

export function isValidationError(
  kind: DiagnoseErrorKind
): kind is (typeof VALIDATION_REASONS)[number] {
  return VALIDATION_REASONS.some((reason) => reason === kind);
}

function isValidationReason(value: unknown): value is (typeof VALIDATION_REASONS)[number] {
  return (
    typeof value === 'string' &&
    VALIDATION_REASONS.some((reason) => reason === value)
  );
}

function isKnownKind(code: unknown): code is DiagnoseErrorKind {
  return (
    typeof code === 'string' &&
    [
      'timeout',
      'content_filter',
      'invalid_image_format',
      'image_too_large',
      'offline',
      'no_session',
      'not_found',
      'generic',
    ].includes(code)
  );
}

function identifyError(kind: IdentifyErrorKind): IdentifyResult {
  return { ok: false, kind, message: IDENTIFY_ERROR_COPY[kind] };
}

function identifyErrorFromCode(code: unknown, status?: number): IdentifyResult {
  if (status === 401 || code === 'no_session') return identifyError('no_session');
  if (isIdentifyErrorKind(code)) return identifyError(code);
  return identifyError('generic');
}

function isIdentifyErrorKind(value: unknown): value is IdentifyErrorKind {
  return (
    typeof value === 'string' &&
    [
      'timeout',
      'content_filter',
      'invalid_image_format',
      'image_too_large',
      'offline',
      'no_session',
      'generic',
    ].includes(value)
  );
}

async function readFunctionErrorBody(error: FunctionsHttpError): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await error.context.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

async function resolutionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsFetchError) return new Error(RESOLVE_OFFLINE_COPY);
  if (error instanceof FunctionsHttpError) {
    const body = await readFunctionErrorBody(error);
    if (error.context?.status === 401 || body.error === 'no_session') {
      return new Error(RESOLVE_SESSION_COPY);
    }
  }
  return new Error(RESOLVE_ERROR_COPY);
}

function resolveErrorFromCode(code: unknown): Error {
  return new Error(code === 'no_session' ? RESOLVE_SESSION_COPY : RESOLVE_ERROR_COPY);
}

function isStableResolutionMessage(message: string): boolean {
  return [RESOLVE_ERROR_COPY, RESOLVE_OFFLINE_COPY, RESOLVE_SESSION_COPY].includes(message);
}

function parseIdentificationSuccess(value: unknown): IdentificationSuccess | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.attemptId !== 'string' ||
    typeof value.imagePath !== 'string' ||
    typeof value.deduped !== 'boolean'
  ) {
    return null;
  }

  const base = {
    ok: true as const,
    attemptId: value.attemptId,
    imagePath: value.imagePath,
    deduped: value.deduped,
  };
  const resultKinds = [value.nonPlant, value.catalogSpecies, value.proposal].filter(
    (item) => item !== undefined
  );
  if (resultKinds.length !== 1) return null;

  if (isRecord(value.nonPlant)) {
    if (!isNonPlantKind(value.nonPlant.kind) || typeof value.nonPlant.floryMessage !== 'string') {
      return null;
    }
    return {
      ...base,
      nonPlant: { kind: value.nonPlant.kind, floryMessage: value.nonPlant.floryMessage },
    };
  }

  if (isRecord(value.catalogSpecies)) {
    const species = value.catalogSpecies;
    if (
      typeof species.id !== 'string' ||
      typeof species.scientificName !== 'string' ||
      typeof species.commonName !== 'string' ||
      !isIdentificationConfidence(species.confidence) ||
      !isStringArray(species.alternatives) ||
      typeof species.floryMessage !== 'string'
    ) {
      return null;
    }
    return {
      ...base,
      catalogSpecies: {
        id: species.id,
        scientificName: species.scientificName,
        commonName: species.commonName,
        confidence: species.confidence,
        alternatives: species.alternatives,
        floryMessage: species.floryMessage,
      },
    };
  }

  if (isRecord(value.proposal)) {
    const proposal = value.proposal;
    if (
      typeof proposal.scientificName !== 'string' ||
      typeof proposal.commonName !== 'string' ||
      !isCareArchetype(proposal.careArchetype) ||
      !isPlantCategory(proposal.category) ||
      !isIdentificationConfidence(proposal.confidence) ||
      !isStringArray(proposal.alternatives) ||
      typeof proposal.floryMessage !== 'string'
    ) {
      return null;
    }
    return {
      ...base,
      proposal: {
        scientificName: proposal.scientificName,
        commonName: proposal.commonName,
        careArchetype: proposal.careArchetype,
        category: proposal.category,
        confidence: proposal.confidence,
        alternatives: proposal.alternatives,
        floryMessage: proposal.floryMessage,
      },
    };
  }

  return null;
}

function parseIdentificationResolution(value: unknown): IdentificationResolution | null {
  if (
    !isRecord(value) ||
    typeof value.resolved !== 'boolean' ||
    !isIdentificationUserAction(value.userAction)
  ) {
    return null;
  }

  if (value.species === null) {
    return { resolved: value.resolved, userAction: value.userAction, species: null };
  }
  if (!isRecord(value.species)) return null;
  const species = value.species;
  if (
    typeof species.id !== 'string' ||
    typeof species.scientificName !== 'string' ||
    typeof species.commonName !== 'string' ||
    !isStringArray(species.aliases) ||
    typeof species.category !== 'string' ||
    !(typeof species.careArchetype === 'string' || species.careArchetype === null) ||
    typeof species.baseWateringDays !== 'number' ||
    typeof species.minWateringDays !== 'number' ||
    typeof species.maxWateringDays !== 'number' ||
    typeof species.lightNeed !== 'string' ||
    typeof species.verified !== 'boolean' ||
    typeof species.approximate !== 'boolean'
  ) {
    return null;
  }

  return {
    resolved: value.resolved,
    userAction: value.userAction,
    species: {
      id: species.id,
      scientificName: species.scientificName,
      commonName: species.commonName,
      aliases: species.aliases,
      category: species.category,
      careArchetype: species.careArchetype,
      baseWateringDays: species.baseWateringDays,
      minWateringDays: species.minWateringDays,
      maxWateringDays: species.maxWateringDays,
      lightNeed: species.lightNeed,
      verified: species.verified,
      approximate: species.approximate,
    },
  };
}

function parsePhotoAttachment(value: unknown): IdentificationPhotoAttachment | null {
  if (
    !isRecord(value) ||
    typeof value.attached !== 'boolean' ||
    !isAttachmentStatus(value.status) ||
    !(typeof value.imagePath === 'string' || value.imagePath === null)
  ) {
    return null;
  }
  return { attached: value.attached, status: value.status, imagePath: value.imagePath };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIdentificationConfidence(value: unknown): value is IdentificationConfidence {
  return value === 'alta' || value === 'media' || value === 'baja';
}

function isNonPlantKind(value: unknown): value is IdentificationNonPlantKind {
  return (
    typeof value === 'string' &&
    [
      'artificial',
      'flores_cortadas',
      'planta_muerta',
      'no_es_planta',
      'multiples_plantas',
      'foto_ilegible',
    ].includes(value)
  );
}

function isCareArchetype(value: unknown): value is IdentificationCareArchetype {
  return (
    typeof value === 'string' &&
    [
      'helecho_humedo',
      'marantacea',
      'aroide_sediento',
      'tropical_medio',
      'lenosa_interior',
      'semisuculenta',
      'suculenta_hoja',
      'suculenta_dura',
      'cactus',
      'ext_flor',
      'ext_mediterranea',
      'ext_arbustiva',
      'ext_nativa_seca',
      'ext_citrico',
      'manual_v1',
    ].includes(value)
  );
}

function isPlantCategory(value: unknown): value is IdentificationPlantCategory {
  return value === 'interior' || value === 'exterior_maceta' || value === 'suculenta_cactus';
}

function isIdentificationUserAction(value: unknown): value is IdentificationUserAction {
  return (
    value === 'confirmo' || value === 'corrigio' || value === 'no_sabe' || value === 'abandono'
  );
}

function isAttachmentStatus(
  value: unknown
): value is IdentificationPhotoAttachment['status'] {
  return value === 'attached' || value === 'already_attached' || value === 'photo_exists';
}
