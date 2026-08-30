-- =====================================================
-- Notificaciones push: cron horario que invoca la Edge Function `send-notifications`.
--
-- La función lee las 3 vistas de trabajo (plants_due_for_watering,
-- watering_missing_feedback, diagnoses_due_for_followup), filtra por la hora local de
-- cada usuario (profiles.push_hour + timezone) y envía por Expo Push. Correr CADA HORA
-- (en UTC); el filtro por hora vive en la función.
--
-- SETUP (una sola vez, antes de aplicar esta migración):
--   1. Elige un secreto largo y aleatorio (p. ej. `openssl rand -hex 32`).
--   2. Guárdalo en Vault:
--        select vault.create_secret('<EL_SECRETO>', 'cron_secret');
--   3. Dáselo también a la función:
--        supabase secrets set CRON_SECRET=<EL_SECRETO>
--        supabase functions deploy send-notifications --no-verify-jwt
--
-- Así el secreto nunca queda en git: el cron lo lee de Vault y la función lo valida.
-- =====================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reprogramable: cron.schedule hace upsert por nombre de job.
select cron.schedule(
  'flory-notifications-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://pidbtxfpbzqcpukdlvdn.supabase.co/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $$
);

-- Para desactivarlo:  select cron.unschedule('flory-notifications-hourly');
--
-- Nota: el pipeline diario completo de Flory es weather → apply_rain_events() →
-- apply_heat_stress() → refresh_plant_statuses() → notificar (tables.sql:1178). Esta
-- función ya llama a refresh_plant_statuses() antes de decidir; las etapas de clima
-- (fetch_weather / apply_rain / apply_heat) se agendan aparte cuando exista su job.
