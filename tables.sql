-- =====================================================
-- FLORY — Esquema definitivo
-- Supabase / PostgreSQL
--
-- Listo para pegar y ejecutar en el SQL Editor de Supabase,
-- sobre un proyecto limpio, de una sola vez.
--
-- Configurado para el PERIODO ABIERTO (primeros 3 meses):
-- el plan 'free' viene con límites amplios. Para activar los
-- planes reales, ver la sección 21 al final del archivo.
--
-- Índice:
--   1. Extensiones y helpers      12. Clima (exterior)
--   2. Enums                      13. Notificaciones
--   3. Planes                     14. Reservations (Stripe)
--   4. Profiles                   15. Analítica
--   5. Suscripciones (IAP)        16. Devices (diciembre)
--   6. Species                    17. Storage
--   7. Plants                     18. Row Level Security
--   8. Motor de riego             19. Vistas para jobs
--   9. Watering events            20. Utilidades
--  10. Diagnoses y caché          21. Activar planes reales
--  11. Límites de uso
-- =====================================================


-- =====================================================
-- 1. EXTENSIONES Y HELPERS
-- =====================================================
create extension if not exists "pgcrypto";
create extension if not exists "unaccent";

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- =====================================================
-- 2. ENUMS
-- =====================================================
create type location_type      as enum ('indoor', 'outdoor');
create type window_orientation as enum ('norte', 'sur', 'este', 'oeste', 'sin_ventana');
create type light_distance     as enum ('junto_ventana', 'cerca', 'lejos');
create type sun_exposure       as enum ('sol_todo_dia', 'sol_manana', 'sol_tarde', 'sombra_parcial', 'sombra');
create type rain_shelter       as enum ('descubierta', 'alero', 'techada');
create type pot_size           as enum ('chica', 'media', 'grande');
create type pot_material       as enum ('plastico', 'greda', 'ceramica', 'otro');
create type light_need         as enum ('baja', 'media', 'alta');
create type plant_status       as enum ('bien', 'atencion', 'urgente');
create type soil_feedback      as enum ('seca', 'humeda', 'empapada');
create type confidence_level   as enum ('alta', 'media', 'baja');
create type plan_tier          as enum ('free', 'founding', 'plus', 'pro');
create type store_platform     as enum ('ios', 'android');
create type sub_status         as enum ('activa', 'periodo_gracia', 'expirada', 'cancelada', 'reembolsada');
create type notification_kind  as enum ('riego', 'atraso', 'sin_feedback', 'seguimiento', 'lluvia', 'sistema');
create type reservation_status as enum ('pendiente', 'autorizada', 'capturada', 'cancelada', 'reembolsada');


-- =====================================================
-- 3. PLANES
--    En tabla, no en código: cambiar un límite es un UPDATE.
--    Los valores de 'free' son los del PERIODO ABIERTO.
-- =====================================================
create table plans (
  tier                 plan_tier primary key,
  name                 text not null,
  price_clp            int  not null,
  price_annual_clp     int,

  max_plants           int,             -- null = ilimitado
  max_diagnoses_month  int  not null,
  max_diagnoses_day    int  not null,
  ai_model             text not null,   -- 'luna' | 'luna_escala_terra' | 'terra'
  history_days         int,             -- null = completo
  followup_enabled     boolean default false,
  early_alerts         boolean default false,
  weather_enabled      boolean default false,
  max_devices          int,
  reading_interval_min int  not null,

  active               boolean default true,
  created_at           timestamptz default now()
);

insert into plans (tier, name, price_clp, price_annual_clp, max_plants,
                   max_diagnoses_month, max_diagnoses_day, ai_model, history_days,
                   followup_enabled, early_alerts, weather_enabled,
                   max_devices, reading_interval_min) values
  -- PERIODO ABIERTO: free con límites amplios
  ('free',     'Free',     0,    null,  null, 50, 10, 'luna_escala_terra', null, true, true, true, 3,  60),
  ('founding', 'Founding', 0,    null,  null, 50, 10, 'luna_escala_terra', null, true, true, true, 3,  60),
  ('plus',     'Plus',     2990, 29900, 5,    20,  5, 'luna_escala_terra', null, true, true, true, 3,  60),
  ('pro',      'Pro',      4990, 49900, null, 60, 10, 'terra',             null, true, true, true, null, 5);


-- =====================================================
-- 4. PROFILES
-- =====================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  display_name    text,
  push_token      text,
  push_hour       int default 9 check (push_hour between 0 and 23),
  push_enabled    boolean default true,
  timezone        text default 'America/Santiago',

  plan            plan_tier not null default 'free',
  plan_expires_at timestamptz,
  founding_user   boolean default false,

  -- Ubicación aproximada (nivel comuna) para el clima de exterior.
  -- Redondeada a 2 decimales a propósito: agrupa el caché y evita GPS preciso.
  lat             numeric(6,2),
  lon             numeric(6,2),
  comuna          text,

  onboarded_at    timestamptz,
  last_active_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index profiles_plan_idx on profiles(plan);
create index profiles_geo_idx  on profiles(lat, lon) where lat is not null;

create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Marca founding_user a todos los que entran durante el periodo abierto.
-- >>> AJUSTAR ESTA FECHA <<<
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, founding_user)
  values (new.id, new.email, now() < '2026-12-01'::timestamptz);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();


-- =====================================================
-- 5. SUSCRIPCIONES (IAP vía RevenueCat)
--    En móvil el cobro recurrente pasa por Apple/Google.
--    Stripe se usa solo para la reserva del sensor (bien físico).
-- =====================================================
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,

  platform        store_platform not null,
  product_id      text not null,          -- ej. 'flory_plus_monthly'
  tier            plan_tier not null,
  original_txn_id text,                   -- identificador estable del store
  rc_app_user_id  text,                   -- debe ser el uuid de Supabase
  latest_receipt  text,

  status          sub_status not null default 'activa',
  is_annual       boolean default false,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz,
  cancelled_at    timestamptz,
  in_trial        boolean default false,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (platform, original_txn_id)
);

create index subs_user_idx   on subscriptions(user_id);
create index subs_expiry_idx on subscriptions(expires_at) where status = 'activa';

create trigger subs_updated before update on subscriptions
  for each row execute function set_updated_at();


-- =====================================================
-- 6. SPECIES  (las 40 fichas)
-- =====================================================
create table species (
  id                 uuid primary key default gen_random_uuid(),
  scientific_name    text not null unique,
  common_name        text not null,
  aliases            text[] default '{}',
  image_url          text,

  base_watering_days int  not null,
  min_watering_days  int  not null,
  max_watering_days  int  not null,
  light_need         light_need not null,
  suitable_outdoor   boolean default false,
  ideal_temp_min     numeric(4,1),
  ideal_temp_max     numeric(4,1),
  ideal_humidity_pct int,
  frost_sensitive    boolean default true,

  difficulty         int check (difficulty between 1 and 5),
  toxic_to_pets      boolean default false,
  care_notes         text,
  common_problems    jsonb default '[]',   -- [{sintoma, causa, accion}]
  prompt_context     text,                 -- bloque estático para el prompt (cacheable)

  active             boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),

  constraint species_interval_sane check (
    min_watering_days <= base_watering_days
    and base_watering_days <= max_watering_days
    and min_watering_days >= 1
  )
);

create index species_fts_idx on species
  using gin (to_tsvector('spanish', common_name || ' ' || scientific_name));
create index species_aliases_idx on species using gin (aliases);

create trigger species_updated before update on species
  for each row execute function set_updated_at();

-- Buscador tolerante a tildes y alias, para el paso 1 del onboarding
create or replace function find_species(p_query text, p_limit int default 10)
returns table (id uuid, common_name text, scientific_name text, image_url text, rank real)
language sql stable as $$
  select s.id, s.common_name, s.scientific_name, s.image_url,
         ts_rank(to_tsvector('spanish', s.common_name || ' ' || s.scientific_name),
                 plainto_tsquery('spanish', unaccent(p_query))) as rank
  from species s
  where s.active
    and (to_tsvector('spanish', s.common_name || ' ' || s.scientific_name)
           @@ plainto_tsquery('spanish', unaccent(p_query))
         or unaccent(lower(s.common_name)) like '%' || unaccent(lower(p_query)) || '%'
         or exists (select 1 from unnest(s.aliases) a
                    where unaccent(lower(a)) like '%' || unaccent(lower(p_query)) || '%'))
  order by rank desc nulls last, s.common_name
  limit p_limit;
$$;


-- =====================================================
-- 7. PLANTS
--    Solo especie, ubicación y último riego son obligatorios.
--    El resto se pide de forma contextual después del onboarding.
-- =====================================================
create table plants (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references profiles(id) on delete cascade,
  species_id            uuid references species(id) on delete set null,

  nickname              text not null,
  photo_url             text,

  location              location_type not null,          -- obligatorio

  -- interior (opcionales)
  window_orientation    window_orientation,
  light_distance        light_distance,

  -- exterior (opcionales)
  sun_exposure          sun_exposure,
  rain_shelter          rain_shelter,

  -- comunes (opcionales)
  pot_size              pot_size,
  pot_material          pot_material,

  current_interval_days int not null,
  last_watered_at       timestamptz,
  next_watering_at      timestamptz,
  status                plant_status default 'bien',

  active                boolean default true,   -- false = congelada por downgrade
  archived              boolean default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index plants_user_idx on plants(user_id) where archived = false;
create index plants_due_idx  on plants(next_watering_at)
  where archived = false and active = true;
create index plants_outdoor_idx on plants(user_id)
  where location = 'outdoor' and archived = false;

create trigger plants_updated before update on plants
  for each row execute function set_updated_at();


-- =====================================================
-- 8. MOTOR DE RIEGO
--    Aritmética pura, sin IA. Interior usa light_distance,
--    exterior usa sun_exposure. Los NULL se tratan como
--    "valor medio", nunca como error.
--
--    NOTA: los factores son estimaciones de partida.
--    El feedback de tierra de los usuarios los va a corregir.
-- =====================================================
create or replace function compute_interval(
  p_base         int,
  p_min          int,
  p_max          int,
  p_location     location_type,
  p_light        light_distance,
  p_pot_size     pot_size,
  p_pot_material pot_material,
  p_sun          sun_exposure default null
) returns int language plpgsql stable as $$
declare f numeric := 1.0;
begin
  if p_location = 'outdoor' then
    f := f * 0.85;                                        -- viento y aire libre

    if    p_sun = 'sol_todo_dia' then f := f * 0.65;
    elsif p_sun = 'sol_tarde'    then f := f * 0.75;      -- más agresivo que el de mañana
    elsif p_sun = 'sol_manana'   then f := f * 0.85;
    elsif p_sun = 'sombra'       then f := f * 1.20;
    end if;                                               -- null => sombra parcial
  else
    if    p_light = 'junto_ventana' then f := f * 0.85;
    elsif p_light = 'lejos'         then f := f * 1.25;
    end if;                                               -- null => cerca
  end if;

  if    p_pot_size = 'chica'  then f := f * 0.80;
  elsif p_pot_size = 'grande' then f := f * 1.30;
  end if;                                                 -- null => media

  if p_pot_material = 'greda' then f := f * 0.80; end if; -- null => plástico

  -- Estación, hemisferio sur. El efecto es más marcado en exterior.
  if extract(month from now()) in (12,1,2) then
    f := f * (case when p_location = 'outdoor' then 0.70 else 0.80 end);
  elsif extract(month from now()) in (6,7,8) then
    f := f * (case when p_location = 'outdoor' then 1.60 else 1.40 end);
  end if;

  return greatest(p_min, least(p_max, round(p_base * f)::int));
end $$;

-- Recalcula cuando el usuario completa datos opcionales
create or replace function recompute_plant_interval(p_plant_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  select compute_interval(s.base_watering_days, s.min_watering_days, s.max_watering_days,
                          p.location, p.light_distance, p.pot_size, p.pot_material, p.sun_exposure)
    into v_new
  from plants p join species s on s.id = p.species_id
  where p.id = p_plant_id;

  if v_new is null then return null; end if;

  update plants set
    current_interval_days = v_new,
    next_watering_at      = coalesce(last_watered_at, now()) + (v_new || ' days')::interval
  where id = p_plant_id;

  return v_new;
end $$;

-- Límite de plantas según el plan
create or replace function enforce_plant_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select pl.max_plants into v_max
  from profiles p join plans pl on pl.tier = p.plan
  where p.id = new.user_id;

  if v_max is null then return new; end if;

  select count(*) into v_count
  from plants where user_id = new.user_id and archived = false;

  if v_count >= v_max then
    raise exception 'limite_plantas_alcanzado' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger plants_limit before insert on plants
  for each row execute function enforce_plant_limit();

-- Downgrade: congela las plantas que exceden el plan, nunca las borra.
-- Deja activas las más antiguas.
create or replace function freeze_plants_over_limit(p_user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_max int; v_frozen int := 0;
begin
  select pl.max_plants into v_max
  from profiles p join plans pl on pl.tier = p.plan
  where p.id = p_user_id;

  if v_max is null then
    update plants set active = true where user_id = p_user_id and archived = false;
    return 0;
  end if;

  with ranked as (
    select id, row_number() over (order by created_at) as rn
    from plants where user_id = p_user_id and archived = false
  )
  update plants p set active = (r.rn <= v_max)
  from ranked r where p.id = r.id;

  select count(*) into v_frozen
  from plants where user_id = p_user_id and archived = false and active = false;

  return v_frozen;
end $$;

-- El plan del profile refleja la suscripción vigente.
-- Los founding users nunca bajan a free.
create or replace function sync_plan_from_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_founding boolean;
begin
  select founding_user into v_founding from profiles where id = new.user_id;

  if new.status in ('activa','periodo_gracia')
     and (new.expires_at is null or new.expires_at > now()) then
    update profiles
      set plan = new.tier, plan_expires_at = new.expires_at
      where id = new.user_id;
  else
    update profiles
      set plan = case when v_founding then 'founding'::plan_tier else 'free'::plan_tier end,
          plan_expires_at = null
      where id = new.user_id;
    perform freeze_plants_over_limit(new.user_id);
  end if;

  return new;
end $$;

create trigger subs_sync_plan after insert or update on subscriptions
  for each row execute function sync_plan_from_subscription();


-- =====================================================
-- 9. WATERING EVENTS  (el loop de aprendizaje)
-- =====================================================
create table watering_events (
  id              uuid primary key default gen_random_uuid(),
  plant_id        uuid not null references plants(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,

  watered_at      timestamptz not null default now(),
  feedback        soil_feedback,
  interval_before int,
  interval_after  int,
  source          text default 'user',   -- user | notification | diagnosis | rain | sensor

  created_at      timestamptz default now()
);

create index watering_plant_idx on watering_events(plant_id, watered_at desc);
create index watering_user_idx  on watering_events(user_id, watered_at desc);

create or replace function apply_watering_feedback()
returns trigger language plpgsql as $$
declare
  v_interval int; v_min int; v_max int;
begin
  select p.current_interval_days,
         coalesce(s.min_watering_days, 2),
         coalesce(s.max_watering_days, 30)
    into v_interval, v_min, v_max
  from plants p left join species s on s.id = p.species_id
  where p.id = new.plant_id;

  new.interval_before := v_interval;

  -- Solo el feedback del usuario ajusta el ritmo.
  -- La lluvia riega pero no enseña nada sobre la planta.
  if    new.feedback = 'seca'     then v_interval := round(v_interval * 0.8);
  elsif new.feedback = 'empapada' then v_interval := round(v_interval * 1.2);
  end if;

  v_interval := greatest(v_min, least(v_max, v_interval));
  new.interval_after := v_interval;

  update plants set
    current_interval_days = v_interval,
    last_watered_at       = new.watered_at,
    next_watering_at      = new.watered_at + (v_interval || ' days')::interval,
    status                = 'bien'
  where id = new.plant_id;

  return new;
end $$;

create trigger watering_feedback before insert on watering_events
  for each row execute function apply_watering_feedback();


-- =====================================================
-- 10. DIAGNOSES Y CACHÉ
-- =====================================================
create table diagnoses (
  id                   uuid primary key default gen_random_uuid(),
  plant_id             uuid references plants(id) on delete cascade,
  user_id              uuid not null references profiles(id) on delete cascade,

  image_path           text not null,
  image_hash           text,             -- sha256 → deduplicación

  symptom_tag          text,             -- normalizado; incluye 'sin_problema'
  cause                text,
  confidence           confidence_level,
  action               text,
  timeframe            text,
  severity             plant_status,
  flory_message        text,
  adjust_interval_days int,              -- ya acotado por la ficha de especie
  raw_response         jsonb,

  model                text,             -- 'luna' | 'terra'
  escalated            boolean default false,
  from_cache           boolean default false,
  deduped              boolean default false,
  input_tokens         int,
  output_tokens        int,
  latency_ms           int,

  followup_at          timestamptz,
  followup_done        boolean default false,
  parent_diagnosis_id  uuid references diagnoses(id) on delete set null,

  created_at           timestamptz default now()
);

create index diagnoses_user_idx     on diagnoses(user_id, created_at desc);
create index diagnoses_hash_idx     on diagnoses(user_id, image_hash);
create index diagnoses_followup_idx on diagnoses(followup_at) where followup_done = false;

-- Programa el seguimiento a 3 semanas si el plan lo incluye
create or replace function schedule_followup()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_enabled boolean;
begin
  if new.symptom_tag = 'sin_problema' or new.severity = 'bien' then
    return new;
  end if;

  select pl.followup_enabled into v_enabled
  from profiles p join plans pl on pl.tier = p.plan
  where p.id = new.user_id;

  if v_enabled then
    new.followup_at := now() + interval '21 days';
  end if;

  return new;
end $$;

create trigger diagnoses_followup before insert on diagnoses
  for each row execute function schedule_followup();

-- Aplica el ajuste que propone el modelo, acotado por la especie.
-- Con confianza baja no se toca nada: una corazonada del modelo
-- no debe cambiar el riego real de la planta.
create or replace function apply_diagnosis_adjustment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_min int; v_max int; v_final int;
begin
  if new.adjust_interval_days is null
     or new.confidence = 'baja'
     or new.plant_id is null then
    return new;
  end if;

  select coalesce(s.min_watering_days, 2), coalesce(s.max_watering_days, 30)
    into v_min, v_max
  from plants p left join species s on s.id = p.species_id
  where p.id = new.plant_id;

  v_final := greatest(v_min, least(v_max, new.adjust_interval_days));

  update plants set
    current_interval_days = v_final,
    next_watering_at      = coalesce(last_watered_at, now()) + (v_final || ' days')::interval,
    status                = coalesce(new.severity, status)
  where id = new.plant_id;

  return new;
end $$;

create trigger diagnoses_adjust after insert on diagnoses
  for each row execute function apply_diagnosis_adjustment();

-- Caché por especie + síntoma
create table diagnosis_cache (
  id          uuid primary key default gen_random_uuid(),
  species_id  uuid references species(id) on delete cascade,
  symptom_tag text not null,
  cause       text not null,
  action      text not null,
  timeframe   text,
  severity    plant_status,
  hits        int default 0,
  created_at  timestamptz default now(),
  unique (species_id, symptom_tag)
);

-- Deduplicación: misma foto del mismo usuario en 24 h → respuesta guardada
create or replace function find_duplicate_diagnosis(p_user_id uuid, p_hash text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from diagnoses
  where user_id = p_user_id
    and image_hash = p_hash
    and created_at > now() - interval '24 hours'
  order by created_at desc
  limit 1;
$$;


-- =====================================================
-- 11. LÍMITES DE USO
-- =====================================================
create table usage_counters (
  user_id    uuid not null references profiles(id) on delete cascade,
  period     date not null,           -- primer día del mes
  diagnoses  int  not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, period)
);

-- Se consulta ANTES de llamar al modelo. Devuelve además qué modelo usar,
-- para que la Edge Function no necesite conocer los planes.
create or replace function check_diagnosis_quota(p_user_id uuid)
returns table (allowed boolean, reason text, model text,
               remaining_month int, remaining_day int, resets_on date)
language plpgsql security definer set search_path = public as $$
declare
  v_plan plan_tier;
  v_month int; v_day int; v_model text;
  v_used_month int; v_used_today int;
begin
  select p.plan into v_plan from profiles p where p.id = p_user_id;

  select pl.max_diagnoses_month, pl.max_diagnoses_day, pl.ai_model
    into v_month, v_day, v_model
  from plans pl where pl.tier = v_plan;

  select coalesce(uc.diagnoses, 0) into v_used_month
  from usage_counters uc
  where uc.user_id = p_user_id and uc.period = date_trunc('month', now())::date;
  v_used_month := coalesce(v_used_month, 0);

  select count(*) into v_used_today
  from diagnoses d
  where d.user_id = p_user_id
    and d.created_at >= date_trunc('day', now())
    and d.from_cache = false and d.deduped = false;

  if v_used_month >= v_month then
    return query select false, 'limite_mensual', v_model, 0, 0,
                        (date_trunc('month', now()) + interval '1 month')::date;
  elsif v_used_today >= v_day then
    return query select false, 'limite_diario', v_model,
                        v_month - v_used_month, 0, (now() + interval '1 day')::date;
  else
    return query select true, null::text, v_model,
                        v_month - v_used_month, v_day - v_used_today, null::date;
  end if;
end $$;

-- Solo se incrementa en llamadas reales al modelo
create or replace function increment_diagnosis_usage(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into usage_counters (user_id, period, diagnoses)
  values (p_user_id, date_trunc('month', now())::date, 1)
  on conflict (user_id, period)
  do update set diagnoses = usage_counters.diagnoses + 1, updated_at = now();
end $$;


-- =====================================================
-- 12. CLIMA  (plantas de exterior)
--     Caché por celda geográfica: muchos usuarios de la
--     misma comuna comparten una sola llamada a la API.
-- =====================================================
create table weather_daily (
  lat          numeric(6,2) not null,
  lon          numeric(6,2) not null,
  day          date not null,

  rain_mm      numeric(6,2) default 0,
  temp_max     numeric(4,1),
  temp_min     numeric(4,1),
  humidity_avg int,
  et0_mm       numeric(5,2),

  fetched_at   timestamptz default now(),
  primary key (lat, lon, day)
);

create index weather_day_idx on weather_daily(day desc);

create or replace view active_weather_cells as
select distinct pr.lat, pr.lon
from profiles pr
join plants p on p.user_id = pr.id
where pr.lat is not null
  and p.location = 'outdoor'
  and p.archived = false and p.active = true;

-- La lluvia se registra COMO UN RIEGO: reutiliza el trigger existente.
-- Umbrales pensados para maceta (poca superficie de captación), no para jardín.
create or replace function apply_rain_events()
returns table (plants_watered int, plants_delayed int)
language plpgsql security definer set search_path = public as $$
declare
  r record; v_effective numeric;
  v_full int := 0; v_partial int := 0;
begin
  for r in
    select p.id, p.user_id, p.rain_shelter, coalesce(sum(w.rain_mm), 0) as rain_48h
    from plants p
    join profiles pr on pr.id = p.user_id
    join weather_daily w
      on w.lat = pr.lat and w.lon = pr.lon
     and w.day >= (now() - interval '2 days')::date
    where p.location = 'outdoor'
      and p.archived = false and p.active = true
      and coalesce(p.rain_shelter, 'descubierta') <> 'techada'
      -- guard contra doble conteo si el usuario ya regó
      and (p.last_watered_at is null or p.last_watered_at < now() - interval '2 days')
    group by p.id, p.user_id, p.rain_shelter
  loop
    v_effective := r.rain_48h * (case when r.rain_shelter = 'alero' then 0.4 else 1.0 end);

    if v_effective >= 15 then
      insert into watering_events (plant_id, user_id, watered_at, feedback, source)
      values (r.id, r.user_id, now(), null, 'rain');
      v_full := v_full + 1;

    elsif v_effective >= 5 then
      update plants
        set next_watering_at = greatest(next_watering_at, now() + interval '2 days')
        where id = r.id;
      v_partial := v_partial + 1;
    end if;
  end loop;

  return query select v_full, v_partial;
end $$;

-- Ola de calor: adelanta el riego un día
create or replace function apply_heat_stress()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with hot as (
    select p.id
    from plants p
    join profiles pr on pr.id = p.user_id
    join weather_daily w
      on w.lat = pr.lat and w.lon = pr.lon
     and w.day >= (now() - interval '2 days')::date
    where p.location = 'outdoor' and p.archived = false and p.active = true
    group by p.id
    having avg(w.temp_max) >= 30
  )
  update plants p
    set next_watering_at = greatest(now(), p.next_watering_at - interval '1 day')
  from hot
  where p.id = hot.id and p.next_watering_at > now();

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Bloque de clima para inyectar en el prompt del diagnóstico
create or replace function weather_context(p_plant_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_rain numeric; v_tmax numeric; v_tmin numeric; v_loc location_type;
begin
  select p.location into v_loc from plants p where p.id = p_plant_id;
  if v_loc is distinct from 'outdoor' then return null; end if;

  select coalesce(sum(w.rain_mm),0), max(w.temp_max), min(w.temp_min)
    into v_rain, v_tmax, v_tmin
  from plants p
  join profiles pr on pr.id = p.user_id
  join weather_daily w
    on w.lat = pr.lat and w.lon = pr.lon
   and w.day >= (now() - interval '7 days')::date
  where p.id = p_plant_id;

  if v_tmax is null then return null; end if;

  return format('Clima últimos 7 días: lluvia %s mm, máxima %s °C, mínima %s °C.',
                round(v_rain,1), round(v_tmax,1), round(v_tmin,1));
end $$;


-- =====================================================
-- 13. NOTIFICACIONES
--     Log para evitar duplicados y medir engagement.
-- =====================================================
create table notifications_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles(id) on delete cascade,
  plant_id  uuid references plants(id) on delete cascade,

  kind      notification_kind not null,
  title     text,
  body      text,
  sent_at   timestamptz default now(),
  opened_at timestamptz,
  acted_at  timestamptz,          -- regó o subió foto tras el aviso
  error     text
);

create index notif_user_idx   on notifications_log(user_id, sent_at desc);
create index notif_dedupe_idx on notifications_log(plant_id, kind, sent_at desc);

-- Evita mandar el mismo aviso dos veces en 20 h
create or replace function can_notify(p_plant_id uuid, p_kind notification_kind)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from notifications_log
    where plant_id = p_plant_id and kind = p_kind
      and sent_at > now() - interval '20 hours'
      and error is null
  );
$$;


-- =====================================================
-- 14. RESERVATIONS  (Stripe — abono del sensor)
--     capture_method: manual → autoriza ahora, cobra al despachar.
-- =====================================================
create table reservations (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references profiles(id) on delete cascade,

  stripe_payment_intent_id text unique,
  amount_clp               int not null default 5000,
  final_price_clp          int not null default 20990,
  status                   reservation_status default 'pendiente',

  full_name                text,
  phone                    text,
  shipping_address         text,
  shipping_city            text,
  shipping_region          text,
  estimated_delivery       text,

  authorized_at            timestamptz,
  captured_at              timestamptz,
  cancelled_at             timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create index reservations_user_idx   on reservations(user_id);
create index reservations_status_idx on reservations(status);

create trigger reservations_updated before update on reservations
  for each row execute function set_updated_at();


-- =====================================================
-- 15. ANALÍTICA
-- =====================================================
create table events (
  id         bigserial primary key,
  user_id    uuid references profiles(id) on delete set null,
  name       text not null,
  props      jsonb default '{}',
  created_at timestamptz default now()
);

create index events_user_idx on events(user_id, created_at desc);
create index events_name_idx on events(name, created_at desc);

-- Retención por cohorte semanal: la métrica que decide si el proyecto sigue
create or replace view retention_cohorts as
with cohorts as (
  select id as user_id, date_trunc('week', created_at)::date as cohort_week, created_at
  from profiles
)
select c.cohort_week,
       count(distinct c.user_id) as usuarios,
       count(distinct c.user_id) filter (
         where exists (select 1 from events e where e.user_id = c.user_id
                       and e.created_at between c.created_at + interval '1 day'
                                            and c.created_at + interval '2 days')) as d1,
       count(distinct c.user_id) filter (
         where exists (select 1 from events e where e.user_id = c.user_id
                       and e.created_at between c.created_at + interval '7 days'
                                            and c.created_at + interval '8 days')) as d7,
       count(distinct c.user_id) filter (
         where exists (select 1 from events e where e.user_id = c.user_id
                       and e.created_at between c.created_at + interval '30 days'
                                            and c.created_at + interval '31 days')) as d30
from cohorts c
group by c.cohort_week
order by c.cohort_week desc;

-- Salud del funnel: las métricas de la decisión a 60 días
create or replace view mvp_health as
select
  (select count(*) from profiles) as usuarios_totales,
  (select count(*) from profiles where onboarded_at is not null) as onboardeados,
  (select round(100.0 * count(*) filter (where feedback is not null) /
          nullif(count(*), 0), 1)
     from watering_events where source in ('user','notification')) as pct_feedback,
  (select count(distinct user_id) from diagnoses) as usuarios_con_diagnostico,
  (select count(*) from reservations where status in ('autorizada','capturada')) as reservas,
  (select round(100.0 * count(*) filter (where status in ('autorizada','capturada')) /
          nullif((select count(*) from profiles), 0), 2)
     from reservations) as pct_reserva;

-- Costo de IA por período
create or replace view ai_cost_monthly as
select date_trunc('month', created_at)::date as mes,
       model,
       count(*) as llamadas,
       sum(input_tokens)  as input_tokens,
       sum(output_tokens) as output_tokens,
       count(*) filter (where from_cache) as desde_cache,
       count(*) filter (where deduped)    as deduplicadas,
       count(*) filter (where escalated)  as escaladas
from diagnoses
group by 1, 2
order by 1 desc, 2;


-- =====================================================
-- 16. DEVICES  (diciembre — no se usa en el MVP)
-- =====================================================
create table devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  plant_id      uuid references plants(id) on delete set null,
  serial_number text unique not null,
  firmware      text,
  battery_pct   int,
  rssi          int,
  last_seen_at  timestamptz,
  paired_at     timestamptz default now(),
  created_at    timestamptz default now()
);

create table sensor_readings (
  id            bigserial primary key,
  device_id     uuid not null references devices(id) on delete cascade,
  plant_id      uuid references plants(id) on delete cascade,
  soil_moisture numeric(5,2),
  temperature   numeric(4,1),
  humidity      numeric(5,2),
  light_lux     int,
  ec            numeric(6,2),
  battery_pct   int,
  measured_at   timestamptz not null default now()
);

create index readings_plant_idx  on sensor_readings(plant_id, measured_at desc);
create index readings_device_idx on sensor_readings(device_id, measured_at desc);


-- =====================================================
-- 17. STORAGE
--     Convención de ruta: {user_id}/{plant_id}/{uuid}.jpg
-- =====================================================
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', false)
on conflict (id) do nothing;

create policy "own photos read" on storage.objects for select
  using (bucket_id = 'plant-photos'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photos insert" on storage.objects for insert
  with check (bucket_id = 'plant-photos'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'plant-photos'
         and (storage.foldername(name))[1] = auth.uid()::text);


-- =====================================================
-- 18. ROW LEVEL SECURITY
--     Regla general: el usuario lee lo suyo.
--     Todo lo que involucra dinero, cupos o llamadas a la IA
--     lo escribe SOLO el service_role desde una Edge Function.
-- =====================================================
alter table plans             enable row level security;
alter table profiles          enable row level security;
alter table subscriptions     enable row level security;
alter table species           enable row level security;
alter table plants            enable row level security;
alter table watering_events   enable row level security;
alter table diagnoses         enable row level security;
alter table diagnosis_cache   enable row level security;
alter table usage_counters    enable row level security;
alter table weather_daily     enable row level security;
alter table notifications_log enable row level security;
alter table reservations      enable row level security;
alter table events            enable row level security;
alter table devices           enable row level security;
alter table sensor_readings   enable row level security;

-- Catálogos públicos
create policy "plans read"   on plans           for select using (true);
create policy "species read" on species         for select using (active);
create policy "cache read"   on diagnosis_cache for select using (true);
create policy "weather read" on weather_daily   for select using (true);

-- Profile propio
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile update" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Suscripciones: solo lectura; las escribe el webhook de RevenueCat
create policy "own subs read" on subscriptions for select using (auth.uid() = user_id);

-- Datos propios editables
create policy "own plants"   on plants          for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own watering" on watering_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own devices"  on devices         for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Solo lectura desde el cliente
create policy "own diagnoses read"     on diagnoses         for select using (auth.uid() = user_id);
create policy "own usage read"         on usage_counters    for select using (auth.uid() = user_id);
create policy "own notifications read" on notifications_log for select using (auth.uid() = user_id);
create policy "own reservations read"  on reservations      for select using (auth.uid() = user_id);

create policy "own readings read" on sensor_readings for select
  using (exists (select 1 from plants p
                 where p.id = sensor_readings.plant_id and p.user_id = auth.uid()));

-- Eventos: el cliente solo inserta
create policy "insert own events" on events for insert with check (auth.uid() = user_id);

-- Impide que el cliente se auto-ascienda de plan editando su profile
create or replace function protect_plan_column()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated'
     and (new.plan is distinct from old.plan
          or new.plan_expires_at is distinct from old.plan_expires_at
          or new.founding_user is distinct from old.founding_user) then
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.founding_user := old.founding_user;
  end if;
  return new;
end $$;

create trigger profiles_protect_plan before update on profiles
  for each row execute function protect_plan_column();


-- =====================================================
-- 19. VISTAS PARA LOS JOBS  (correr con service_role)
-- =====================================================
create or replace view plants_due_for_watering as
select p.id as plant_id, p.user_id, p.nickname, p.next_watering_at, p.location,
       pr.push_token, pr.timezone, pr.push_hour,
       s.common_name,
       extract(day from now() - p.next_watering_at)::int as days_overdue
from plants p
join profiles pr on pr.id = p.user_id
left join species s on s.id = p.species_id
where p.archived = false and p.active = true
  and p.next_watering_at <= now()
  and pr.push_token is not null and pr.push_enabled
  and can_notify(p.id, 'riego');

create or replace view diagnoses_due_for_followup as
select d.id as diagnosis_id, d.user_id, d.plant_id, d.image_path,
       p.nickname, pr.push_token, pr.timezone
from diagnoses d
join plants p    on p.id = d.plant_id
join profiles pr on pr.id = d.user_id
join plans pl    on pl.tier = pr.plan
where d.followup_done = false
  and d.followup_at <= now()
  and pl.followup_enabled
  and pr.push_token is not null and pr.push_enabled;

-- Regó pero nunca dijo cómo estaba la tierra: recuperar el loop de aprendizaje
create or replace view watering_missing_feedback as
select we.id as event_id, we.plant_id, we.user_id, p.nickname, pr.push_token
from watering_events we
join plants p    on p.id = we.plant_id
join profiles pr on pr.id = we.user_id
where we.feedback is null
  and we.source in ('user','notification')
  and we.watered_at between now() - interval '2 days' and now() - interval '4 hours'
  and pr.push_token is not null and pr.push_enabled
  and can_notify(we.plant_id, 'sin_feedback');

-- Historial visible según el plan
create or replace view visible_watering_history as
select we.*
from watering_events we
join profiles pr on pr.id = we.user_id
join plans pl    on pl.tier = pr.plan
where pl.history_days is null
   or we.watered_at >= now() - (pl.history_days || ' days')::interval;

-- Datos opcionales que faltan → prompts contextuales de Flory
create or replace view plants_missing_data as
select p.id as plant_id, p.user_id, p.nickname, p.location,
       (p.pot_size is null)     as falta_maceta,
       (p.pot_material is null) as falta_material,
       (p.location = 'indoor'  and p.light_distance is null) as falta_luz,
       (p.location = 'outdoor' and p.sun_exposure is null)   as falta_sol,
       (p.location = 'outdoor' and p.rain_shelter is null)   as falta_lluvia
from plants p
where p.archived = false and p.active = true
  and (p.pot_size is null or p.pot_material is null
       or (p.location = 'indoor'  and p.light_distance is null)
       or (p.location = 'outdoor' and (p.sun_exposure is null or p.rain_shelter is null)));


-- =====================================================
-- 20. UTILIDADES
-- =====================================================

-- Estado actual de una planta, listo para la ficha
create or replace function plant_summary(p_plant_id uuid)
returns table (
  nickname text, species_name text, status plant_status,
  days_until_watering int, interval_days int,
  last_diagnosis_at timestamptz, missing_data boolean
) language sql stable security definer set search_path = public as $$
  select p.nickname, s.common_name, p.status,
         extract(day from p.next_watering_at - now())::int,
         p.current_interval_days,
         (select max(created_at) from diagnoses d where d.plant_id = p.id),
         (p.pot_size is null or p.pot_material is null)
  from plants p
  left join species s on s.id = p.species_id
  where p.id = p_plant_id;
$$;

-- Borrado de cuenta: el cascade se encarga del resto
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- Recalcula el estado de todas las plantas (job diario, antes de notificar)
create or replace function refresh_plant_statuses()
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update plants set status = case
    when next_watering_at <= now() - interval '3 days' then 'urgente'
    when next_watering_at <= now() + interval '1 day'  then 'atencion'
    else 'bien'
  end
  where archived = false and active = true;

  get diagnostics v_count = row_count;
  return v_count;
end $$;


-- =====================================================
-- ORDEN DE LOS JOBS DIARIOS (pg_cron o Edge Function programada)
--   1. fetch_weather        → llena weather_daily desde active_weather_cells
--   2. apply_rain_events()
--   3. apply_heat_stress()
--   4. refresh_plant_statuses()
--   5. notificar desde plants_due_for_watering
--   6. notificar desde diagnoses_due_for_followup
--   7. notificar desde watering_missing_feedback
--
-- El orden importa: el clima ajusta las fechas ANTES de decidir
-- a quién avisar. Al revés, le mandas "tengo sed" a alguien cuya
-- planta acaba de recibir 20 mm de lluvia.
-- =====================================================


-- =====================================================
-- 21. ACTIVAR LOS PLANES REALES
--     NO ejecutar ahora. Correr cuando termine el periodo abierto
--     (~diciembre 2026), y avisar a los usuarios varios días antes.
-- =====================================================
/*

-- 1) Free vuelve a sus límites reales
update plans set
  max_plants          = 1,
  max_diagnoses_month = 3,
  max_diagnoses_day   = 2,
  ai_model            = 'luna',
  history_days        = 30,
  followup_enabled    = false,
  early_alerts        = false
where tier = 'free';

-- 2) Los founding users conservan acceso amplio
update profiles set plan = 'founding' where founding_user and plan = 'free';

-- 3) Dejar de marcar founding a los nuevos
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

-- 4) Congelar las plantas que excedan el nuevo límite (no se borran)
select freeze_plants_over_limit(id) from profiles where plan = 'free';

*/