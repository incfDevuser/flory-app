import { corsHeaders, json } from '../_shared/cors.ts';
import {
  CHAT_DAILY_LIMIT,
  CHAT_HISTORY_LIMIT,
  CHAT_INSTRUCTIONS,
} from '../_shared/chat-schema.ts';
import { callChat, OpenAIError, type ChatTurn } from '../_shared/openai.ts';
import { createAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

/**
 * `chat` — la planta conversa con la persona en primera persona.
 *
 * A diferencia de `diagnose`, no hay imagen ni Structured Outputs: es texto multivuelta.
 * El flujo: validar propiedad → tope diario → memoria reciente → contexto de la planta →
 * modelo → insertar el turno del usuario y la respuesta de la planta (con service_role,
 * salta RLS). La llave de OpenAI y la service_role nunca tocan el cliente.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createAdminClient();

  const userId = await getUserId(admin, req.headers.get('Authorization'));
  if (!userId) return json({ error: 'no_session' }, 401);

  let body: { plantId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const plantId = body.plantId;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!plantId || !text) return json({ error: 'bad_request' }, 400);
  if (text.length > 2000) return json({ error: 'bad_request' }, 400);

  // La planta tiene que ser del usuario; de paso trae el contexto.
  const { data: plant, error: plantError } = await admin
    .from('plants')
    .select(
      `id, user_id, nickname, status, next_watering_at, location,
       window_orientation, light_distance, sun_exposure, rain_shelter,
       species:species_id ( common_name, scientific_name, toxic_to_pets, common_problems )`
    )
    .eq('id', plantId)
    .maybeSingle();

  if (plantError) return json({ error: 'generic' }, 500);
  if (!plant || plant.user_id !== userId) return json({ error: 'not_found' }, 404);

  // Tope diario (ventana móvil de 24 h). Se cuenta ANTES de insertar el mensaje nuevo.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('created_at', since);
  if (countError) return json({ error: 'generic' }, 500);
  if ((count ?? 0) >= CHAT_DAILY_LIMIT) return json({ error: 'quota' });

  // Memoria conversacional y clínica. Ambas consultas repiten user_id porque el cliente
  // admin salta RLS: aunque ya validamos la propiedad, el filtro mantiene el aislamiento
  // explícito en cada lectura sensible.
  const [historyResult, diagnosesResult] = await Promise.all([
    admin
      .from('chat_messages')
      .select('role, content')
      .eq('plant_id', plantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT),
    admin
      .from('diagnoses')
      .select(
        'created_at, cause, confidence, action, timeframe, not_recoverable, severity, user_action'
      )
      .eq('plant_id', plantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  if (historyResult.error || diagnosesResult.error) {
    return json({ error: 'generic' }, 500);
  }

  const historyRows = historyResult.data;
  const diagnoses = (diagnosesResult.data ?? []) as DiagnosisCtx[];

  const turns: ChatTurn[] = (historyRows ?? [])
    .slice()
    .reverse()
    .map((row: { role: string; content: string }) => ({
      role: row.role === 'plant' ? ('assistant' as const) : ('user' as const),
      content: row.content,
    }));
  turns.push({ role: 'user', content: text });

  const context = buildChatContext(plant as PlantCtx, diagnoses);

  const model =
    Deno.env.get('FLORY_MODEL_CHAT') ?? Deno.env.get('FLORY_MODEL_LUNA') ?? 'gpt-5.6-luna';

  let reply: string;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  try {
    const result = await callChat({
      model,
      instructions: CHAT_INSTRUCTIONS,
      context,
      turns,
      maxOutputTokens: 220,
      reasoningEffort: 'low',
      promptCacheKey: 'flory-chat-v2',
      timeoutMs: 15_000,
    });
    reply = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    // El chat no debe dejar a la persona sin respuesta: si el modelo falla, la planta
    // contesta con una frase de acompañamiento honesta en vez de un error seco.
    if (err instanceof OpenAIError) {
      reply = fallbackReply();
    } else {
      return json({ error: 'generic' }, 500);
    }
  }

  if (!reply) reply = fallbackReply();

  // El turno del usuario primero, luego el de la planta: dos inserts para que el orden
  // cronológico no dependa de un empate de created_at.
  const { error: userInsertError } = await admin
    .from('chat_messages')
    .insert({ plant_id: plantId, user_id: userId, role: 'user', content: text });
  if (userInsertError) return json({ error: 'generic' }, 500);

  const { error: plantInsertError } = await admin.from('chat_messages').insert({
    plant_id: plantId,
    user_id: userId,
    role: 'plant',
    content: reply,
    tokens: outputTokens,
    model,
  });
  if (plantInsertError) return json({ error: 'generic' }, 500);

  return json({ reply });
});

// ---------------------------------------------------------------------------------

type SpeciesCtx = {
  common_name: string | null;
  scientific_name: string | null;
  toxic_to_pets: string | null;
  common_problems: unknown;
};

type PlantCtx = {
  nickname: string;
  status: string | null;
  next_watering_at: string | null;
  location: string;
  window_orientation: string | null;
  light_distance: string | null;
  sun_exposure: string | null;
  rain_shelter: string | null;
  species: SpeciesCtx | SpeciesCtx[] | null;
};

type DiagnosisCtx = {
  created_at: string;
  cause: string | null;
  confidence: string | null;
  action: string | null;
  timeframe: string | null;
  not_recoverable: string | null;
  severity: string | null;
  user_action: string | null;
};

/** Contexto de la planta para el modelo. Solo días, nunca números crudos. */
function buildChatContext(plant: PlantCtx, diagnoses: DiagnosisCtx[]): string {
  const species = Array.isArray(plant.species) ? plant.species[0] : plant.species;
  const lines: string[] = ['CONTEXTO DE ESTA PLANTA', `Nombre: ${plant.nickname}.`];

  if (species?.common_name) {
    const sci = species.scientific_name ? ` (${species.scientific_name})` : '';
    lines.push(`Especie: ${species.common_name}${sci}.`);
  } else {
    lines.push('Especie: aún sin identificar.');
  }

  lines.push(`Estado actual: ${statusPhrase(plant.status)}.`);
  lines.push(`Próximo riego: ${wateringPhrase(plant.next_watering_at)}.`);
  lines.push(`Toxicidad para mascotas: ${toxicityPhrase(species)}.`);

  const problems = toProblemList(species?.common_problems).slice(0, 2);
  if (problems.length > 0) {
    lines.push(`Problemas frecuentes de mi especie: ${problems.join('; ')}.`);
  }

  lines.push(`Ubicación: ${environmentPhrase(plant)}.`);
  lines.push(`Estación: ${currentSeason()} (hemisferio sur).`);

  appendDiagnosisHistory(lines, diagnoses);

  return lines.join('\n');
}

function appendDiagnosisHistory(lines: string[], diagnoses: DiagnosisCtx[]): void {
  lines.push('', 'HISTORIAL DE DIAGNÓSTICOS GUARDADOS');

  if (diagnoses.length === 0) {
    lines.push('No hay diagnósticos guardados para esta planta.');
    return;
  }

  lines.push(
    'Son registros pasados, del más reciente al más antiguo. No demuestran por sí solos mi estado actual.'
  );

  const labels = ['Diagnóstico más reciente', 'Diagnóstico anterior', 'Diagnóstico más antiguo incluido'];
  diagnoses.forEach((diagnosis, index) => {
    lines.push(`${labels[index]} (${diagnosisAgePhrase(diagnosis.created_at)}):`);
    appendDiagnosisField(lines, 'Hallazgo', diagnosis.cause);
    appendDiagnosisField(lines, 'Confianza', diagnosis.confidence);
    appendDiagnosisField(lines, 'Estado observado', diagnosis.severity);
    appendDiagnosisField(lines, 'Acción recomendada', diagnosis.action);
    appendDiagnosisField(lines, 'Plazo indicado', diagnosis.timeframe);
    appendDiagnosisField(lines, 'Evolución esperada', diagnosis.not_recoverable);
    appendDiagnosisField(lines, 'Validación de la persona', diagnosisValidationPhrase(diagnosis.user_action));
  });
}

function appendDiagnosisField(lines: string[], label: string, value: string | null): void {
  const clean = value?.trim();
  if (clean) lines.push(`${label}: ${clean}.`);
}

function diagnosisAgePhrase(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return 'momento no disponible';

  const days = Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

function diagnosisValidationPhrase(action: string | null): string | null {
  if (action === 'confirmo') return 'confirmó que el diagnóstico coincidía';
  if (action === 'corrigio') return 'indicó que era otra cosa';
  if (action === 'no_sabe') return 'no pudo confirmarlo';
  if (action === 'abandono') return 'no dejó una validación';
  return null;
}

function statusPhrase(status: string | null): string {
  if (status === 'urgente') return 'necesito atención pronto (urgente)';
  if (status === 'atencion') return 'me estoy acercando a necesitar algo (atención)';
  return 'estoy bien';
}

function wateringPhrase(nextWateringAt: string | null): string {
  if (!nextWateringAt) return 'aún estoy aprendiendo cuándo será';
  const parsed = Date.parse(nextWateringAt);
  if (Number.isNaN(parsed)) return 'aún estoy aprendiendo cuándo será';

  const raw = (parsed - Date.now()) / 86_400_000;
  const days = raw >= 0 ? Math.ceil(raw) : Math.floor(raw);
  if (days < -1) return `quedó pendiente hace ${Math.abs(days)} días`;
  if (days === -1) return 'quedó pendiente desde ayer';
  if (days === 0) return 'es hoy';
  if (days === 1) return 'es mañana';
  return `es en ${days} días`;
}

function toxicityPhrase(species: SpeciesCtx | null | undefined): string {
  if (!species) return 'no hay información confirmada (aún no sé mi especie)';
  switch (species.toxic_to_pets) {
    case 'si':
      return 'soy tóxica si mi mascota me mastica';
    case 'no':
      return 'no soy tóxica para mascotas';
    default:
      return 'no hay información confirmada sobre mi toxicidad';
  }
}

function environmentPhrase(plant: PlantCtx): string {
  if (plant.location === 'outdoor') {
    const parts: string[] = ['exterior'];
    if (plant.sun_exposure) parts.push(`sol ${plant.sun_exposure.replace(/_/g, ' ')}`);
    if (plant.rain_shelter) parts.push(plant.rain_shelter);
    return parts.join(', ');
  }
  const parts: string[] = ['interior'];
  if (plant.light_distance) parts.push(`luz ${plant.light_distance.replace(/_/g, ' ')}`);
  return parts.join(', ');
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

const FALLBACK_REPLIES = [
  'Ahora me cuesta encontrar las palabras, pero aquí sigo contigo.',
  'Se me enredaron las ideas por un momento. ¿Me lo cuentas de nuevo?',
  'Me quedé pensando y no supe qué decir. Igual me alegra que me hables.',
];

function fallbackReply(): string {
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
}
