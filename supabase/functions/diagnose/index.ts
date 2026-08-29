import { corsHeaders, json } from '../_shared/cors.ts';
import {
  DIAGNOSIS_FORMAT,
  DIAGNOSIS_INSTRUCTIONS,
  type DiagnosisOutput,
} from '../_shared/diagnosis-schema.ts';
import {
  base64ToBytes,
  deleteImage,
  sha256Hex,
  signImage,
  uploadImage,
} from '../_shared/image.ts';
import { callResponses, OpenAIError } from '../_shared/openai.ts';
import { createAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

/**
 * `diagnose` — la planta mira su propia foto y explica qué le pasa (INTEGRACION_IA.MD §4).
 *
 * Flujo: dedupe → cupo → subir/firmar → armar contexto (especie + entorno + historial +
 * clima) → Luna → insertar en `diagnoses` (los triggers aplican el ajuste de riego y
 * programan el seguimiento). Terra queda construido pero apagado por env.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createAdminClient();

  const userId = await getUserId(admin, req.headers.get('Authorization'));
  if (!userId) return json({ error: 'no_session' }, 401);

  let body: { plantId?: string; imageBase64?: string; focus?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const { plantId, imageBase64 } = body;
  if (!plantId || !imageBase64) return json({ error: 'bad_request' }, 400);

  // El foco orienta al modelo; no lo obliga. Un cliente viejo no lo manda → 'general'.
  const focus = toFocus(body.focus);

  // La planta tiene que ser del usuario. Se trae aquí y de paso sirve de contexto.
  const { data: plant, error: plantError } = await admin
    .from('plants')
    .select(
      `id, user_id, nickname, location, window_orientation, light_distance,
       sun_exposure, rain_shelter, pot_size, pot_material, current_interval_days,
       last_watered_at, photo_url, species_id,
       species:species_id ( common_name, scientific_name, prompt_context,
         base_watering_days, min_watering_days, max_watering_days, light_need,
         category, common_problems )`
    )
    .eq('id', plantId)
    .maybeSingle();

  if (plantError) return json({ error: 'generic' }, 500);
  if (!plant || plant.user_id !== userId) return json({ error: 'not_found' }, 404);

  const bytes = base64ToBytes(imageBase64);
  const hash = await sha256Hex(bytes);

  // 1. Dedupe: misma foto del mismo usuario en 24 h → se devuelve la guardada, sin modelo.
  const { data: dupId } = await admin.rpc('find_duplicate_diagnosis', {
    p_user_id: userId,
    p_hash: hash,
  });
  if (dupId) {
    const { data: existing } = await admin
      .from('diagnoses')
      .select('*')
      .eq('id', dupId)
      .maybeSingle();
    // Diagnósticos creados con v1 no validaron sujeto. No se reutilizan: la misma foto
    // debe pasar por la guarda nueva antes de volver a considerarse válida.
    if (existing?.raw_response?.validation?.status === 'valid') {
      return json({ deduped: true, diagnosis: existing });
    }
  }

  // 2. Cupo. Devuelve además qué modelo tocaría (hoy siempre Luna).
  const { data: quotaRows, error: quotaError } = await admin.rpc('check_diagnosis_quota', {
    p_user_id: userId,
  });
  if (quotaError) return json({ error: 'generic' }, 500);
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  if (!quota?.allowed) {
    return json({
      error: 'quota',
      reason: quota?.reason ?? 'limite_mensual',
      resetsOn: quota?.resets_on ?? null,
    });
  }

  // 3. Subir al bucket privado y firmar una URL corta para el modelo.
  let imagePath: string;
  let signedUrl: string;
  try {
    imagePath = await uploadImage(admin, userId, plantId, bytes);
    signedUrl = await signImage(admin, imagePath);
  } catch {
    return json({ error: 'generic' }, 500);
  }

  // La foto guardada es una referencia opcional: ayuda a detectar otro ejemplar, pero
  // una ruta vieja o ausente no debe impedir diagnosticar por especie y contexto.
  let referenceUrl: string | null = null;
  if (plant.photo_url) {
    try {
      referenceUrl = await signImage(admin, plant.photo_url);
    } catch {
      console.warn('No se pudo firmar la foto de referencia de la planta.', plantId);
    }
  }

  // 4. Contexto: lo que desambigua la foto débil (INTEGRACION_IA.MD:303-334).
  const context = await buildContext(admin, plant, focus);

  // 5. Luna. (Escalamiento a Terra apagado: FLORY_ENABLE_TERRA.)
  const model = Deno.env.get('FLORY_MODEL_LUNA') ?? 'gpt-5.6-luna';
  const started = Date.now();
  let result;
  try {
    result = await callResponses<DiagnosisOutput>({
      model,
      instructions: DIAGNOSIS_INSTRUCTIONS,
      userText: context,
      images: [
        ...(referenceUrl
          ? [
              {
                label:
                  'FOTO DE REFERENCIA: imagen anterior del ejemplar guardado. Úsala solo para detectar diferencias claras; no la diagnostiques.',
                imageUrl: referenceUrl,
                detail: 'low' as const,
              },
            ]
          : []),
        {
          label:
            'FOTO NUEVA PARA DIAGNOSTICAR: valida que corresponda a la planta objetivo y analiza únicamente esta imagen.',
          imageUrl: signedUrl,
          detail: 'high' as const,
        },
      ],
      format: DIAGNOSIS_FORMAT,
      maxOutputTokens: 750,
      reasoningEffort: 'low',
      promptCacheKey: 'flory-diagnose-v2',
      timeoutMs: 15_000,
    });
  } catch (err) {
    await deleteImage(admin, imagePath);
    if (err instanceof OpenAIError) return json({ error: err.code });
    return json({ error: 'generic' }, 500);
  }
  const latencyMs = Date.now() - started;
  const out = result.parsed;

  // El modelo ya miró la imagen, pero no es un diagnóstico si el sujeto no corresponde.
  // No se inserta fila, no corren triggers y no se descuenta cupo visible.
  const validationReason = failedValidationReason(out.validation);
  if (validationReason) {
    await deleteImage(admin, imagePath);
    return json({
      error: 'validation_failed',
      reason: validationReason,
      validation: out.validation,
    });
  }

  // Structured Outputs debería garantizarlo. Si llega inconsistente, se falla cerrado:
  // nunca insertar un diagnóstico vacío que pueda tocar el riego.
  if (!out.diagnosis) {
    await deleteImage(admin, imagePath);
    return json({ error: 'invalid_json' });
  }
  const diagnosis = out.diagnosis;

  // 6. Guardar. Los triggers diagnoses_adjust y diagnoses_followup hacen el resto:
  //    acotan adjust_interval_days a la ficha de especie y programan el seguimiento.
  const { data: inserted, error: insertError } = await admin
    .from('diagnoses')
    .insert({
      plant_id: plantId,
      user_id: userId,
      image_path: imagePath,
      image_hash: hash,
      symptom_tag: diagnosis.symptom_tag,
      cause: diagnosis.cause,
      confidence: diagnosis.confidence,
      action: diagnosis.action,
      timeframe: diagnosis.timeframe,
      not_recoverable: diagnosis.not_recoverable,
      severity: diagnosis.severity,
      flory_message: diagnosis.flory_message,
      adjust_interval_days: diagnosis.adjust_interval_days,
      raw_response: out,
      model: 'luna',
      escalated: false,
      from_cache: false,
      deduped: false,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: latencyMs,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    await deleteImage(admin, imagePath);
    return json({ error: 'generic' }, 500);
  }

  // 7. El cupo solo se descuenta en llamadas reales al modelo (ni dedupe ni caché).
  await admin.rpc('increment_diagnosis_usage', { p_user_id: userId });

  return json({ deduped: false, diagnosis: inserted });
});

// ---------------------------------------------------------------------------------

/**
 * Foco del usuario. Se re-valida aquí (no se puede importar el tipo del cliente en el
 * runtime de Deno) y se traduce a una instrucción para el modelo. Es una pista que
 * prioriza dónde mirar: nunca calla un problema más grave en otra parte.
 */
type DiagnosisFocus = 'general' | 'plagas' | 'hojas';

function toFocus(value: unknown): DiagnosisFocus {
  return value === 'plagas' || value === 'hojas' ? value : 'general';
}

const FOCUS_LINE: Record<DiagnosisFocus, string> = {
  general: 'La persona pide un diagnóstico general de salud.',
  plagas:
    'La persona sospecha insectos o plagas: revisa con especial cuidado el envés de las hojas, los nudos, los brotes nuevos y la superficie de la tierra. Si no encuentras plaga, dilo con honestidad y sigue con el resto.',
  hojas:
    'La persona quiere que revises las hojas: color, manchas, textura y bordes. Si el problema real está en otra parte (riego, luz, raíces), dilo igual.',
};

type SpeciesCtx = {
  common_name: string;
  scientific_name: string;
  prompt_context: string | null;
  base_watering_days: number | null;
  min_watering_days: number | null;
  max_watering_days: number | null;
  light_need: string | null;
  category: string | null;
  common_problems: unknown;
};

type SubjectValidation = DiagnosisOutput['validation'];

type PlantCtx = {
  id: string;
  nickname: string;
  location: string;
  window_orientation: string | null;
  light_distance: string | null;
  sun_exposure: string | null;
  rain_shelter: string | null;
  pot_size: string | null;
  pot_material: string | null;
  current_interval_days: number;
  last_watered_at: string | null;
  photo_url: string | null;
  species_id: string | null;
  species: SpeciesCtx | SpeciesCtx[] | null;
};

/** Arma el bloque de texto que acompaña a la foto. Todo sale de la base, no del usuario. */
async function buildContext(
  admin: ReturnType<typeof createAdminClient>,
  plant: PlantCtx,
  focus: DiagnosisFocus
) {
  const species = Array.isArray(plant.species) ? plant.species[0] : plant.species;
  const lines: string[] = [
    'FOCO DEL USUARIO',
    FOCUS_LINE[focus],
    '',
    'PLANTA OBJETIVO',
    `Ficha: ${plant.nickname}.`,
  ];

  // ESPECIE — se prefiere el prompt_context ya redactado del catálogo.
  if (species) {
    lines.push('ESPECIE');
    if (species.prompt_context && species.prompt_context.trim().length > 0) {
      lines.push(species.prompt_context.trim());
    } else {
      lines.push(`${species.common_name} (${species.scientific_name}).`);
      if (species.base_watering_days) {
        lines.push(
          `Riego de referencia cada ${species.base_watering_days} días ` +
            `(rango seguro ${species.min_watering_days}-${species.max_watering_days}).`
        );
      }
    }
    const problems = toProblemList(species.common_problems);
    if (problems.length > 0) {
      lines.push(`Problemas frecuentes: ${problems.join('; ')}.`);
    }
  } else {
    lines.push('ESPECIE');
    lines.push('Especie sin identificar. No hay ficha de catálogo para esta planta.');
  }

  // ENTORNO
  lines.push('', 'ENTORNO');
  lines.push(plant.location === 'outdoor' ? 'Exterior.' : 'Interior.');
  const env: string[] = [];
  if (plant.location === 'indoor') {
    if (plant.window_orientation) env.push(`ventana ${plant.window_orientation}`);
    if (plant.light_distance) env.push(`luz ${plant.light_distance.replace('_', ' ')}`);
  } else {
    if (plant.sun_exposure) env.push(`sol ${plant.sun_exposure.replace(/_/g, ' ')}`);
    if (plant.rain_shelter) env.push(plant.rain_shelter);
  }
  if (plant.pot_size) env.push(`maceta ${plant.pot_size}`);
  if (plant.pot_material) env.push(plant.pot_material);
  if (env.length > 0) lines.push(env.join(', ') + '.');
  lines.push(`Estación: ${currentSeason()} (hemisferio sur).`);

  // HISTORIAL
  lines.push('', 'HISTORIAL');
  lines.push(`Intervalo actual: ${plant.current_interval_days} días.`);
  if (plant.last_watered_at) {
    lines.push(`Último riego: hace ${daysSince(plant.last_watered_at)} días.`);
  } else {
    lines.push('Último riego: sin registro.');
  }

  const { data: waterings } = await admin
    .from('watering_events')
    .select('feedback')
    .eq('plant_id', plant.id)
    .not('feedback', 'is', null)
    .order('watered_at', { ascending: false })
    .limit(3);
  const feedbacks = (waterings ?? [])
    .map((w: { feedback: string | null }) => w.feedback)
    .filter((f): f is string => !!f);
  if (feedbacks.length > 0) {
    lines.push(`Últimos feedbacks de tierra: ${feedbacks.reverse().join(', ')}.`);
  }

  const { count: priorCount } = await admin
    .from('diagnoses')
    .select('id', { count: 'exact', head: true })
    .eq('plant_id', plant.id);
  lines.push(`Diagnósticos previos: ${priorCount ?? 0}.`);

  // CLIMA — solo exterior; el RPC devuelve null si no aplica.
  if (plant.location === 'outdoor') {
    const { data: weather } = await admin.rpc('weather_context', { p_plant_id: plant.id });
    if (typeof weather === 'string' && weather.length > 0) {
      lines.push('', 'CLIMA', weather);
    }
  }

  return lines.join('\n');
}

/**
 * Falla cerrado ante contradicciones del modelo. El prompt decide el caso normal, pero
 * estas invariantes protegen el riego incluso si `status` y los campos se contradicen.
 */
function failedValidationReason(validation: SubjectValidation) {
  if (!validation.is_real_potted_plant) {
    return validation.reason ?? 'no_es_planta';
  }
  if (validation.expected_species_match === 'mismatch') {
    return 'especie_no_coincide';
  }
  if (validation.reference_plant_match === 'mismatch') {
    return 'planta_no_coincide';
  }
  if (validation.status !== 'valid') {
    return validation.reason ?? 'foto_ilegible';
  }
  return null;
}

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
    .filter((s) => s.trim().length > 0);
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Estación en el hemisferio sur, por mes de Santiago. */
function currentSeason(): string {
  const month = Number(
    new Intl.DateTimeFormat('en', {
      timeZone: 'America/Santiago',
      month: 'numeric',
    }).format(new Date())
  );
  if (month === 12 || month <= 2) return 'verano';
  if (month <= 5) return 'otoño';
  if (month <= 8) return 'invierno';
  return 'primavera';
}
