import { corsHeaders, json } from '../_shared/cors.ts';
import {
  CARE_ARCHETYPES,
  IDENTIFICATION_CONFIDENCES,
  IDENTIFICATION_FORMAT,
  IDENTIFICATION_INSTRUCTIONS,
  NON_PLANT_KINDS,
  type CareArchetypeName,
  type IdentificationOutput,
  type PlantCategory,
} from '../_shared/identification-schema.ts';
import {
  base64ToBytes,
  deleteImage,
  sha256Hex,
  signImage,
  uploadImage,
} from '../_shared/image.ts';
import { callResponses, OpenAIError } from '../_shared/openai.ts';
import { createAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

/** Identifica una foto sin crear todavía una especie ni una planta. */

const MODEL = Deno.env.get('FLORY_MODEL_LUNA') ?? 'gpt-5.6-luna';
const MODEL_LABEL = 'luna';
const DEDUPE_HOURS = 24;

type CatalogSpecies = {
  id: string;
  scientific_name: string;
  common_name: string;
  aliases: string[] | null;
};

type CareArchetype = {
  name: CareArchetypeName;
  description: string;
  base_watering_days: number;
  min_watering_days: number;
  max_watering_days: number;
  light_need: string;
  category: PlantCategory;
};

type IdentificationContext = {
  instructions: string;
  speciesByScientificName: Map<string, CatalogSpecies>;
  archetypesByName: Map<string, CareArchetype>;
};

type AttemptMeta = {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  deduped: boolean;
};

let identificationContextPromise: Promise<IdentificationContext> | null = null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('No se pudo crear el cliente admin.', error);
    return json({ error: 'generic' }, 500);
  }

  const userId = await getUserId(admin, req.headers.get('Authorization'));
  if (!userId) return json({ error: 'no_session' }, 401);

  let body: { imageBase64?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof body.imageBase64 !== 'string' || body.imageBase64.length === 0) {
    return json({ error: 'bad_request' }, 400);
  }

  let bytes: Uint8Array;
  let hash: string;
  try {
    bytes = base64ToBytes(body.imageBase64);
    if (bytes.byteLength === 0) return json({ error: 'bad_request' }, 400);
    hash = await sha256Hex(bytes);
  } catch {
    return json({ error: 'invalid_image_format' }, 400);
  }

  let context: IdentificationContext;
  try {
    context = await getIdentificationContext(admin);
  } catch (error) {
    console.error('No se pudo cargar el catálogo para identificar.', error);
    return json({ error: 'generic' }, 500);
  }

  // Dedupe directo: se reutiliza únicamente la salida normalizada, nunca la fila ni foto.
  const cutoff = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: duplicate, error: duplicateError } = await admin
    .from('identification_attempts')
    .select('species_id, species_guess, confidence, non_plant, raw_response, model')
    .eq('user_id', userId)
    .eq('image_hash', hash)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duplicateError) {
    console.error('Falló la búsqueda de identificación duplicada.', duplicateError);
    return json({ error: 'generic' }, 500);
  }

  if (duplicate?.raw_response) {
    const normalized = normalizeIdentification(duplicate.raw_response, context);
    if (normalized) {
      const result = await persistNewAttempt({
        admin,
        userId,
        bytes,
        hash,
        output: normalized,
        model: typeof duplicate.model === 'string' ? duplicate.model : MODEL_LABEL,
        meta: { inputTokens: 0, outputTokens: 0, latencyMs: 0, deduped: true },
        context,
      });
      if (result) return json(result);
      return json({ error: 'generic' }, 500);
    }
  }

  let imagePath: string;
  let signedUrl: string;
  try {
    imagePath = await uploadImage(admin, userId, 'tmp', bytes);
    signedUrl = await signImage(admin, imagePath);
  } catch (error) {
    console.error('No se pudo preparar la foto de identificación.', error);
    if (typeof imagePath! === 'string') await deleteImage(admin, imagePath!);
    return json({ error: 'generic' }, 500);
  }

  const started = Date.now();
  let modelResult;
  try {
    modelResult = await callIdentificationModel(context.instructions, signedUrl);
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof OpenAIError && error.code === 'content_filter') {
      const filtered = contentFilterOutput();
      const inserted = await insertAttempt(admin, {
        userId,
        imagePath,
        hash,
        output: filtered,
        model: MODEL_LABEL,
        meta: { inputTokens: 0, outputTokens: 0, latencyMs, deduped: false },
      });
      if (inserted) {
        return json(buildResponse(inserted.id, imagePath, false, filtered, context));
      }
    }

    await deleteImage(admin, imagePath);
    if (error instanceof OpenAIError) return json({ error: error.code });
    console.error('Falló el modelo de identificación.', error);
    return json({ error: 'generic' }, 500);
  }

  const latencyMs = Date.now() - started;
  const normalized = normalizeIdentification(modelResult.parsed, context);
  if (!normalized) {
    await deleteImage(admin, imagePath);
    return json({ error: 'invalid_json' });
  }

  const inserted = await insertAttempt(admin, {
    userId,
    imagePath,
    hash,
    output: normalized,
    model: MODEL_LABEL,
    meta: {
      inputTokens: modelResult.inputTokens,
      outputTokens: modelResult.outputTokens,
      latencyMs,
      deduped: false,
    },
  });

  if (!inserted) {
    await deleteImage(admin, imagePath);
    return json({ error: 'generic' }, 500);
  }

  return json(buildResponse(inserted.id, imagePath, false, normalized, context));
});

async function callIdentificationModel(instructions: string, signedUrl: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callResponses<IdentificationOutput>({
        model: MODEL,
        instructions,
        userText: 'Identifica únicamente la planta de la FOTO PARA IDENTIFICAR.',
        images: [
          {
            label:
              'FOTO PARA IDENTIFICAR: primero comprueba que sea una planta viva en maceta.',
            imageUrl: signedUrl,
            detail: 'high',
          },
        ],
        format: IDENTIFICATION_FORMAT,
        maxOutputTokens: 400,
        // `minimal` no existe en Luna (400 unsupported_value). `low` es el escalón más
        // barato que sí acepta y deja el razonamiento en ~20 tokens.
        reasoningEffort: 'low',
        promptCacheKey: 'flory-identify-v1',
        timeoutMs: 15_000,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof OpenAIError) || error.code !== 'invalid_json' || attempt === 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function persistNewAttempt(params: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  bytes: Uint8Array;
  hash: string;
  output: IdentificationOutput;
  model: string;
  meta: AttemptMeta;
  context: IdentificationContext;
}) {
  const { admin, userId, bytes, hash, output, model, meta, context } = params;
  let imagePath: string | null = null;
  try {
    imagePath = await uploadImage(admin, userId, 'tmp', bytes);
    const inserted = await insertAttempt(admin, {
      userId,
      imagePath,
      hash,
      output,
      model,
      meta,
    });
    if (!inserted) {
      await deleteImage(admin, imagePath);
      return null;
    }
    return buildResponse(inserted.id, imagePath, true, output, context);
  } catch (error) {
    if (imagePath) await deleteImage(admin, imagePath);
    console.error('No se pudo guardar el intento deduplicado.', error);
    return null;
  }
}

async function insertAttempt(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    imagePath: string;
    hash: string;
    output: IdentificationOutput;
    model: string;
    meta: AttemptMeta;
  }
) {
  const { userId, imagePath, hash, output, model, meta } = params;
  const speciesId = output.species_in_catalog
    ? (await getIdentificationContext(admin)).speciesByScientificName.get(
        output.species_in_catalog
      )?.id ?? null
    : null;
  const { data, error } = await admin
    .from('identification_attempts')
    .insert({
      user_id: userId,
      image_path: imagePath,
      image_hash: hash,
      species_id: speciesId,
      species_guess: output.species_guess,
      confidence: output.confidence,
      non_plant: output.non_plant_kind,
      raw_response: { ...output, _meta: meta },
      resolved: false,
      model,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('No se pudo insertar identification_attempts.', error);
    return null;
  }
  return data as { id: string };
}

function buildResponse(
  attemptId: string,
  imagePath: string,
  deduped: boolean,
  output: IdentificationOutput,
  context: IdentificationContext
) {
  const base = { attemptId, imagePath, deduped };
  if (!output.is_living_potted_plant) {
    return {
      ...base,
      nonPlant: {
        kind: output.non_plant_kind,
        floryMessage: output.flory_message,
      },
    };
  }

  if (output.species_in_catalog) {
    const species = context.speciesByScientificName.get(output.species_in_catalog)!;
    return {
      ...base,
      catalogSpecies: {
        id: species.id,
        scientificName: species.scientific_name,
        commonName: species.common_name,
        confidence: output.confidence,
        alternatives: output.alternatives,
        floryMessage: output.flory_message,
      },
    };
  }

  const archetype = context.archetypesByName.get(output.care_archetype!);
  return {
    ...base,
    proposal: {
      scientificName: output.species_guess,
      commonName: output.common_name_es,
      careArchetype: output.care_archetype,
      category: archetype?.category ?? output.category,
      confidence: output.confidence,
      alternatives: output.alternatives,
      floryMessage: output.flory_message,
    },
  };
}

function normalizeIdentification(
  value: unknown,
  context: IdentificationContext
): IdentificationOutput | null {
  if (!value || typeof value !== 'object') return null;
  const output = value as Record<string, unknown>;
  if (typeof output.is_living_potted_plant !== 'boolean') return null;
  if (typeof output.flory_message !== 'string' || output.flory_message.trim() === '') {
    return null;
  }

  const alternatives = Array.isArray(output.alternatives)
    ? output.alternatives
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];

  if (!output.is_living_potted_plant) {
    if (!isOneOf(output.non_plant_kind, NON_PLANT_KINDS)) return null;
    return {
      is_living_potted_plant: false,
      non_plant_kind: output.non_plant_kind,
      species_in_catalog: null,
      species_guess: null,
      common_name_es: null,
      care_archetype: null,
      category: null,
      confidence: null,
      alternatives: [],
      flory_message: output.flory_message.trim(),
    };
  }

  if (!isOneOf(output.confidence, IDENTIFICATION_CONFIDENCES)) return null;

  // La coincidencia es exacta y solo contra especies activas verificadas.
  const catalogName =
    typeof output.species_in_catalog === 'string' &&
    context.speciesByScientificName.has(output.species_in_catalog)
      ? output.species_in_catalog
      : null;
  if (catalogName) {
    return {
      is_living_potted_plant: true,
      non_plant_kind: null,
      species_in_catalog: catalogName,
      species_guess: null,
      common_name_es: null,
      care_archetype: null,
      category: null,
      confidence: output.confidence,
      alternatives,
      flory_message: output.flory_message.trim(),
    };
  }

  const scientificName = firstNonEmptyString(output.species_guess, output.species_in_catalog);
  const commonName = firstNonEmptyString(output.common_name_es);
  if (!scientificName || !commonName || typeof output.care_archetype !== 'string') return null;
  const archetype = context.archetypesByName.get(output.care_archetype);
  if (!archetype) return null;

  return {
    is_living_potted_plant: true,
    non_plant_kind: null,
    species_in_catalog: null,
    species_guess: scientificName,
    common_name_es: commonName,
    care_archetype: archetype.name,
    category: archetype.category,
    confidence: output.confidence,
    alternatives,
    flory_message: output.flory_message.trim(),
  };
}

function contentFilterOutput(): IdentificationOutput {
  return {
    is_living_potted_plant: false,
    non_plant_kind: 'foto_ilegible',
    species_in_catalog: null,
    species_guess: null,
    common_name_es: null,
    care_archetype: null,
    category: null,
    confidence: null,
    alternatives: [],
    flory_message: 'No alcanzo a verme bien en esta foto. ¿Probamos con otra?',
  };
}

function getIdentificationContext(
  admin: ReturnType<typeof createAdminClient>
): Promise<IdentificationContext> {
  if (!identificationContextPromise) {
    identificationContextPromise = loadIdentificationContext(admin).catch((error) => {
      identificationContextPromise = null;
      throw error;
    });
  }
  return identificationContextPromise;
}

async function loadIdentificationContext(
  admin: ReturnType<typeof createAdminClient>
): Promise<IdentificationContext> {
  const [speciesResult, archetypesResult] = await Promise.all([
    admin
      .from('species')
      .select('id, scientific_name, common_name, aliases')
      .eq('active', true)
      .eq('verified_cl', true)
      .order('scientific_name', { ascending: true }),
    admin
      .from('care_archetypes')
      .select(
        `name, description, base_watering_days, min_watering_days,
         max_watering_days, light_need, category`
      )
      .order('name', { ascending: true }),
  ]);

  if (speciesResult.error) throw speciesResult.error;
  if (archetypesResult.error) throw archetypesResult.error;

  const species = (speciesResult.data ?? []) as CatalogSpecies[];
  const archetypes = (archetypesResult.data ?? []) as CareArchetype[];
  species.sort(compareBy('scientific_name'));
  archetypes.sort(compareBy('name'));

  const knownArchetypes = CARE_ARCHETYPES as readonly string[];
  if (
    archetypes.length !== CARE_ARCHETYPES.length ||
    archetypes.some((item) => !knownArchetypes.includes(item.name))
  ) {
    throw new Error('Los arquetipos desplegados no coinciden con el esquema de identificación.');
  }

  const catalogLines = species.map(
    (item) =>
      `${cleanPromptValue(item.scientific_name)} | ${cleanPromptValue(item.common_name)} | ${
        (item.aliases ?? []).map(cleanPromptValue).join(', ') || '-'
      }`
  );
  const archetypeLines = archetypes.map(
    (item) => `${cleanPromptValue(item.name)} | ${cleanPromptValue(item.description)}`
  );

  return {
    instructions: `${IDENTIFICATION_INSTRUCTIONS}\n\nCATÁLOGO\n${catalogLines.join(
      '\n'
    )}\n\nARQUETIPOS\n${archetypeLines.join('\n')}`,
    speciesByScientificName: new Map(species.map((item) => [item.scientific_name, item])),
    archetypesByName: new Map(archetypes.map((item) => [item.name, item])),
  };
}

function compareBy<T extends string>(key: T) {
  return (a: Record<T, string>, b: Record<T, string>) =>
    a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
}

function cleanPromptValue(value: string): string {
  return value.replace(/[\r\n|]+/g, ' ').trim();
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
