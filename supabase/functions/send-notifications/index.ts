import { corsHeaders, json } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

/**
 * Job de notificaciones push de Flory. Lo invoca pg_cron cada hora (ver
 * migrations/20260828_notifications_cron.sql), NO la app.
 *
 * Lee las 3 vistas de trabajo, filtra por la hora local elegida por cada usuario
 * (`profiles.push_hour` + `timezone`), manda por Expo Push, y registra en
 * `notifications_log` (que alimenta el dedupe de 20 h de `can_notify`).
 *
 * Protección: header `x-cron-secret` == secreto `CRON_SECRET`. Desplegar con
 * `--no-verify-jwt` (lo llama el cron, no un usuario).
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

type Kind = 'riego' | 'sin_feedback' | 'seguimiento';

type Outgoing = {
  token: string;
  title: string;
  body: string;
  kind: Kind;
  userId: string;
  plantId: string | null;
  diagnosisId?: string;
};

/** Hora local (0-23) en una timezone. Cae a Santiago si la tz es inválida. */
function localHour(timezone: string | null): number {
  const tz = timezone ?? 'America/Santiago';
  const read = (zone: string) =>
    Number.parseInt(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: zone }).format(
        new Date(),
      ),
      10,
    ) % 24;
  try {
    return read(tz);
  } catch {
    return read('America/Santiago');
  }
}

/** Una frase estable por planta y día (misma idea que lib/plant-messages.ts). */
function pick(plantId: string | null, options: string[]): string {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${plantId ?? ''}${dayKey}`
    .split('')
    .reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return options[seed % options.length];
}

// Voz de Flory: primera persona, nunca reta ni culpa, no afirma certezas.
const RIEGO = [
  'Tengo sed, ¿me riegas cuando puedas?',
  'Creo que ya me toca agua. ¿Me echas un vistazo?',
  'Es buen momento para regarme. Revisa mi tierra y vemos.',
];
const RIEGO_ATRASO = [
  'Sigo esperando mi agua. Cuando puedas, nos ponemos al día sin apuro.',
  'Todavía tengo sed. Un poco de agua me vendría muy bien hoy.',
  'Me quedó pendiente el riego. Revisemos mi tierra con calma.',
];
const SIN_FEEDBACK = [
  '¿Cómo quedó mi tierra después del riego? Contarme me ayuda a ajustar.',
  '¿Me diste agua? Saber cómo me viste me ayuda a cuidarme mejor.',
];
const SEGUIMIENTO = [
  '¿Cómo voy con lo que revisamos? Una foto nos dice si mejoré.',
  'Pasó un tiempo desde el diagnóstico. ¿Me sacas una foto para ver cómo sigo?',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  const admin = createAdminClient();

  // `refresh_plant_statuses()` es un UPDATE a toda la tabla; las vistas de notificación
  // usan `next_watering_at`, no `status`, así que NO se necesita cada hora. Se corre una
  // vez al día (≈8am Chile) para mantener fresco el color de estado que ve la app. Las
  // otras 23 corridas horarias quedan feather-light. Best-effort: los builders de
  // supabase-js no tienen `.catch`, así que va en try.
  if (new Date().getUTCHours() === 11) {
    try {
      await admin.rpc('refresh_plant_statuses');
    } catch {
      // Un fallo aquí no debe frenar el envío.
    }
  }

  const [watering, followup, missing] = await Promise.all([
    admin.from('plants_due_for_watering').select('*'),
    admin.from('diagnoses_due_for_followup').select('*'),
    admin.from('watering_missing_feedback').select('*'),
  ]);

  // push_hour/timezone no están en las 3 vistas; se resuelven por usuario.
  const userIds = new Set<string>();
  for (const row of watering.data ?? []) userIds.add(row.user_id);
  for (const row of followup.data ?? []) userIds.add(row.user_id);
  for (const row of missing.data ?? []) userIds.add(row.user_id);

  const prefs = new Map<string, { hour: number; tz: string | null }>();
  if (userIds.size > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, push_hour, timezone')
      .in('id', [...userIds]);
    for (const p of data ?? []) prefs.set(p.id, { hour: p.push_hour ?? 9, tz: p.timezone });
  }

  const dueNow = (userId: string): boolean => {
    const pref = prefs.get(userId);
    if (!pref) return false;
    return localHour(pref.tz) === pref.hour;
  };

  const outgoing: Outgoing[] = [];

  for (const row of watering.data ?? []) {
    if (!dueNow(row.user_id)) continue;
    const overdue = (row.days_overdue ?? 0) >= 3;
    outgoing.push({
      token: row.push_token,
      title: row.nickname,
      body: pick(row.plant_id, overdue ? RIEGO_ATRASO : RIEGO),
      kind: 'riego',
      userId: row.user_id,
      plantId: row.plant_id,
    });
  }
  for (const row of missing.data ?? []) {
    if (!dueNow(row.user_id)) continue;
    outgoing.push({
      token: row.push_token,
      title: row.nickname,
      body: pick(row.plant_id, SIN_FEEDBACK),
      kind: 'sin_feedback',
      userId: row.user_id,
      plantId: row.plant_id,
    });
  }
  for (const row of followup.data ?? []) {
    if (!dueNow(row.user_id)) continue;
    outgoing.push({
      token: row.push_token,
      title: row.nickname,
      body: pick(row.plant_id, SEGUIMIENTO),
      kind: 'seguimiento',
      userId: row.user_id,
      plantId: row.plant_id,
      diagnosisId: row.diagnosis_id,
    });
  }

  if (outgoing.length === 0) return json({ sent: 0 });

  // Enviar por lotes y recoger los tickets en orden.
  const tickets: { status?: string; message?: string; details?: { error?: string } }[] = [];
  for (let i = 0; i < outgoing.length; i += BATCH) {
    const chunk = outgoing.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map((m) => ({
          to: m.token,
          title: m.title,
          body: m.body,
          sound: 'default',
          data: { plantId: m.plantId, kind: m.kind },
        })),
      ),
    });
    const payload = await res.json().catch(() => ({ data: [] }));
    const data = Array.isArray(payload?.data) ? payload.data : [];
    for (let j = 0; j < chunk.length; j++) tickets.push(data[j] ?? {});
  }

  // Log (dedupe), followups completados, y limpieza de tokens muertos.
  const logs: Record<string, unknown>[] = [];
  const doneDiagnoses: string[] = [];
  const deadTokens = new Set<string>();

  outgoing.forEach((m, i) => {
    const ticket = tickets[i] ?? {};
    const failed = ticket.status === 'error';
    logs.push({
      user_id: m.userId,
      plant_id: m.plantId,
      kind: m.kind,
      title: m.title,
      body: m.body,
      error: failed ? (ticket.message ?? 'push_error') : null,
    });
    if (!failed && m.diagnosisId) doneDiagnoses.push(m.diagnosisId);
    if (failed && ticket.details?.error === 'DeviceNotRegistered') deadTokens.add(m.token);
  });

  if (logs.length > 0) await admin.from('notifications_log').insert(logs);
  if (doneDiagnoses.length > 0) {
    await admin.from('diagnoses').update({ followup_done: true }).in('id', doneDiagnoses);
  }
  for (const token of deadTokens) {
    await admin.from('profiles').update({ push_token: null }).eq('push_token', token);
  }

  const sent = logs.filter((l) => l.error === null).length;
  return json({ sent, attempted: outgoing.length, dead_tokens: deadTokens.size });
});
