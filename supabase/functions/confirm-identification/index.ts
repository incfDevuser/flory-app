import { corsHeaders, json } from '../_shared/cors.ts';
import { deleteImage } from '../_shared/image.ts';
import { createAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

/** Confirma una propuesta o adjunta su foto temporal sin confiar en datos del cliente. */

const BUCKET = 'plant-photos';
const USER_ACTIONS = ['confirmo', 'corrigio', 'no_sabe', 'abandono'] as const;

type UserAction = (typeof USER_ACTIONS)[number];

type Attempt = {
  id: string;
  user_id: string;
  image_path: string;
  species_id: string | null;
  species_guess: string | null;
  confidence: string | null;
  non_plant: string | null;
  raw_response: unknown;
  resolved: boolean;
  user_corrected_species_id: string | null;
  user_action: UserAction | null;
};

type SpeciesRow = {
  id: string;
  scientific_name: string;
  common_name: string;
  aliases: string[] | null;
  category: string;
  care_archetype: string | null;
  base_watering_days: number;
  min_watering_days: number;
  max_watering_days: number;
  light_need: string;
  verified_cl: boolean | null;
};

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (body.operation === 'resolve') return resolveAttempt(admin, userId, body);
  if (body.operation === 'attach_photo') return attachPhoto(admin, userId, body);
  return json({ error: 'bad_request' }, 400);
});

async function resolveAttempt(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  body: Record<string, unknown>
) {
  const attemptId = stringValue(body.attemptId);
  const userAction = isOneOf(body.userAction, USER_ACTIONS) ? body.userAction : null;
  if (!attemptId || !userAction) return json({ error: 'bad_request' }, 400);

  const attempt = await getOwnedAttempt(admin, userId, attemptId);
  if (attempt === 'error') return json({ error: 'generic' }, 500);
  if (!attempt) return json({ error: 'not_found' }, 404);
  if (userAction === 'abandono') {
    const updated = await updateAttempt(admin, userId, attemptId, {
      resolved: false,
      user_action: 'abandono',
    });
    if (!updated) return json({ error: 'generic' }, 500);
    return json({ resolved: false, userAction: 'abandono', species: null });
  }

  if (attempt.non_plant) return json({ error: 'invalid_state' }, 409);

  if (userAction === 'no_sabe') {
    const updated = await updateAttempt(admin, userId, attemptId, {
      resolved: true,
      user_action: 'no_sabe',
      user_corrected_species_id: null,
    });
    if (!updated) return json({ error: 'generic' }, 500);
    return json({ resolved: true, userAction: 'no_sabe', species: null });
  }

  if (userAction === 'corrigio') {
    const selectedSpeciesId = stringValue(body.selectedSpeciesId);
    if (!selectedSpeciesId) return json({ error: 'bad_request' }, 400);
    const species = await getActiveSpecies(admin, selectedSpeciesId);
    if (species === 'error') return json({ error: 'generic' }, 500);
    if (!species) return json({ error: 'species_not_found' }, 404);

    const updated = await updateAttempt(admin, userId, attemptId, {
      resolved: true,
      user_action: 'corrigio',
      user_corrected_species_id: species.id,
    });
    if (!updated) return json({ error: 'generic' }, 500);
    return json({ resolved: true, userAction: 'corrigio', species: mapSpecies(species) });
  }

  // Una confirmación de catálogo siempre usa species_id guardado por `identify`.
  if (attempt.species_id) {
    const species = await getActiveSpecies(admin, attempt.species_id);
    if (species === 'error') return json({ error: 'generic' }, 500);
    if (!species) return json({ error: 'species_not_found' }, 404);
    const updated = await updateAttempt(admin, userId, attemptId, {
      resolved: true,
      user_action: 'confirmo',
      user_corrected_species_id: null,
    });
    if (!updated) return json({ error: 'generic' }, 500);
    return json({ resolved: true, userAction: 'confirmo', species: mapSpecies(species) });
  }

  // Fuera de catálogo: solo se leen campos que la Edge Function guardó en raw_response.
  const proposal = readStoredProposal(attempt.raw_response);
  if (!proposal) return json({ error: 'invalid_state' }, 409);

  const { data: archetype, error: archetypeError } = await admin
    .from('care_archetypes')
    .select('name, category')
    .eq('name', proposal.careArchetype)
    .maybeSingle();
  if (archetypeError) {
    console.error('No se pudo validar el arquetipo.', archetypeError);
    return json({ error: 'generic' }, 500);
  }
  if (!archetype || typeof archetype.category !== 'string') {
    return json({ error: 'invalid_state' }, 409);
  }

  const { data: provisionalId, error: provisionalError } = await admin.rpc(
    'create_provisional_species',
    {
      p_scientific_name: proposal.scientificName,
      p_common_name: proposal.commonName,
      p_archetype: proposal.careArchetype,
      p_category: archetype.category,
      p_aliases: [],
      p_problems: [],
    }
  );
  if (provisionalError || typeof provisionalId !== 'string') {
    console.error('No se pudo crear la especie provisional.', provisionalError);
    return json({ error: 'generic' }, 500);
  }

  const species = await getActiveSpecies(admin, provisionalId);
  if (species === 'error') return json({ error: 'generic' }, 500);
  if (!species) return json({ error: 'generic' }, 500);

  const updated = await updateAttempt(admin, userId, attemptId, {
    species_id: species.id,
    resolved: true,
    user_action: 'confirmo',
    user_corrected_species_id: null,
  });
  if (!updated) return json({ error: 'generic' }, 500);

  return json({ resolved: true, userAction: 'confirmo', species: mapSpecies(species) });
}

async function attachPhoto(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  body: Record<string, unknown>
) {
  const attemptId = stringValue(body.attemptId);
  const plantId = stringValue(body.plantId);
  if (!attemptId || !plantId) return json({ error: 'bad_request' }, 400);

  const attempt = await getOwnedAttempt(admin, userId, attemptId);
  if (attempt === 'error') return json({ error: 'generic' }, 500);
  if (!attempt) return json({ error: 'not_found' }, 404);
  if (!attempt.resolved || attempt.non_plant) return json({ error: 'invalid_state' }, 409);

  const { data: plant, error: plantError } = await admin
    .from('plants')
    .select('id, user_id, photo_url')
    .eq('id', plantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (plantError) {
    console.error('No se pudo cargar la planta para adjuntar la foto.', plantError);
    return json({ error: 'generic' }, 500);
  }
  if (!plant) return json({ error: 'not_found' }, 404);

  const sourcePath = attempt.image_path;
  if (!sourcePath.startsWith(`${userId}/`)) return json({ error: 'invalid_state' }, 409);
  const basename = sourcePath.split('/').at(-1);
  if (!basename || basename === '.' || basename === '..') {
    return json({ error: 'invalid_state' }, 409);
  }
  const destinationPath = `${userId}/${plantId}/${basename}`;

  // Otra foto gana siempre. Si esta misma ya quedó puesta, se completa el reintento.
  if (plant.photo_url && plant.photo_url !== destinationPath) {
    return json({ attached: false, status: 'photo_exists', imagePath: plant.photo_url });
  }

  if (sourcePath !== destinationPath) {
    const { error: copyError } = await admin.storage
      .from(BUCKET)
      .copy(sourcePath, destinationPath);
    if (copyError && !(await storageObjectExists(admin, destinationPath))) {
      console.error('No se pudo copiar la foto temporal.', copyError);
      return json({ error: 'generic' }, 500);
    }
  } else if (!(await storageObjectExists(admin, destinationPath))) {
    return json({ error: 'generic' }, 500);
  }

  if (sourcePath !== destinationPath) {
    const updatedAttempt = await updateAttempt(admin, userId, attemptId, {
      image_path: destinationPath,
    });
    if (!updatedAttempt) return json({ error: 'generic' }, 500);
  }

  let attached = plant.photo_url === destinationPath;
  let status = attached ? 'already_attached' : 'attached';
  if (!plant.photo_url) {
    const { data: updatedPlant, error: updatePlantError } = await admin
      .from('plants')
      .update({ photo_url: destinationPath })
      .eq('id', plantId)
      .eq('user_id', userId)
      .is('photo_url', null)
      .select('photo_url')
      .maybeSingle();
    if (updatePlantError) {
      console.error('No se pudo adjuntar la foto a la planta.', updatePlantError);
      return json({ error: 'generic' }, 500);
    }

    if (updatedPlant?.photo_url === destinationPath) {
      attached = true;
    } else {
      const { data: currentPlant, error: currentPlantError } = await admin
        .from('plants')
        .select('photo_url')
        .eq('id', plantId)
        .eq('user_id', userId)
        .maybeSingle();
      if (currentPlantError || !currentPlant) return json({ error: 'generic' }, 500);
      attached = currentPlant.photo_url === destinationPath;
      status = attached ? 'already_attached' : 'photo_exists';
    }
  }

  // La fila ya apunta al destino. El origen se borra al final y nunca bloquea la respuesta.
  if (sourcePath !== destinationPath) await deleteImage(admin, sourcePath);

  return json({
    attached,
    status,
    imagePath: attached ? destinationPath : null,
  });
}

async function getOwnedAttempt(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  attemptId: string
): Promise<Attempt | null | 'error'> {
  const { data, error } = await admin
    .from('identification_attempts')
    .select(
      `id, user_id, image_path, species_id, species_guess, confidence, non_plant,
       raw_response, resolved, user_corrected_species_id, user_action`
    )
    .eq('id', attemptId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('No se pudo cargar identification_attempts.', error);
    return 'error';
  }
  return (data as Attempt | null) ?? null;
}

async function getActiveSpecies(
  admin: ReturnType<typeof createAdminClient>,
  speciesId: string
): Promise<SpeciesRow | null | 'error'> {
  const { data, error } = await admin
    .from('species')
    .select(
      `id, scientific_name, common_name, aliases, category, care_archetype,
       base_watering_days, min_watering_days, max_watering_days, light_need, verified_cl`
    )
    .eq('id', speciesId)
    .eq('active', true)
    .maybeSingle();
  if (error) {
    console.error('No se pudo cargar la especie confirmada.', error);
    return 'error';
  }
  return (data as SpeciesRow | null) ?? null;
}

async function updateAttempt(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  attemptId: string,
  values: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await admin
    .from('identification_attempts')
    .update(values)
    .eq('id', attemptId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    console.error('No se pudo actualizar identification_attempts.', error);
    return false;
  }
  return true;
}

async function storageObjectExists(
  admin: ReturnType<typeof createAdminClient>,
  path: string
): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  if (slash < 0) return false;
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(folder, {
    limit: 2,
    search: name,
  });
  return !error && (data ?? []).some((item) => item.name === name);
}

function readStoredProposal(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.is_living_potted_plant !== true) return null;
  const scientificName = stringValue(value.species_guess);
  const commonName = stringValue(value.common_name_es);
  const careArchetype = stringValue(value.care_archetype);
  if (!scientificName || !commonName || !careArchetype) return null;
  return { scientificName, commonName, careArchetype };
}

function mapSpecies(species: SpeciesRow) {
  return {
    id: species.id,
    scientificName: species.scientific_name,
    commonName: species.common_name,
    aliases: species.aliases ?? [],
    category: species.category,
    careArchetype: species.care_archetype,
    baseWateringDays: species.base_watering_days,
    minWateringDays: species.min_watering_days,
    maxWateringDays: species.max_watering_days,
    lightNeed: species.light_need,
    verified: species.verified_cl === true,
    approximate: species.verified_cl !== true,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
