-- =====================================================
-- FLORY — Hardening post-linter
-- Ejecutar DESPUÉS de flory_schema_final.sql y flory_species_seed.sql
--
-- Resuelve, en orden de gravedad real:
--   A. Vistas que ignoraban RLS  (fuga de datos entre usuarios)
--   B. Funciones internas ejecutables por cualquiera
--   C. search_path mutable
--   D. auth.uid() reevaluado por fila (rendimiento)
--   E. Foreign keys sin índice
-- =====================================================


-- =====================================================
-- A. VISTAS — security_invoker
--
-- El problema: una vista creada por postgres corre con los
-- permisos de postgres, no del que consulta. RLS no se aplica.
-- Es decir: cualquier usuario autenticado que consultara
-- visible_watering_history veía los riegos de TODOS.
--
-- security_invoker = on hace que la vista respete el RLS del
-- que consulta. Los jobs siguen funcionando porque corren con
-- service_role, que salta RLS de todas formas.
-- =====================================================

alter view active_weather_cells        set (security_invoker = on);
alter view retention_cohorts           set (security_invoker = on);
alter view mvp_health                  set (security_invoker = on);
alter view ai_cost_monthly             set (security_invoker = on);
alter view plants_due_for_watering     set (security_invoker = on);
alter view diagnoses_due_for_followup  set (security_invoker = on);
alter view watering_missing_feedback   set (security_invoker = on);
alter view visible_watering_history    set (security_invoker = on);
alter view plants_missing_data         set (security_invoker = on);

-- Las vistas de analítica y de jobs no tienen por qué ser
-- visibles desde la app. Solo service_role.
revoke all on retention_cohorts          from anon, authenticated;
revoke all on mvp_health                 from anon, authenticated;
revoke all on ai_cost_monthly            from anon, authenticated;
revoke all on active_weather_cells       from anon, authenticated;
revoke all on plants_due_for_watering    from anon, authenticated;
revoke all on diagnoses_due_for_followup from anon, authenticated;
revoke all on watering_missing_feedback  from anon, authenticated;


-- =====================================================
-- B. FUNCIONES — quitar EXECUTE a quien no lo necesita
--
-- Postgres da EXECUTE a PUBLIC por defecto, y PostgREST
-- expone eso como endpoint RPC. Sin esto, cualquier usuario
-- autenticado podía llamar:
--
--   check_diagnosis_quota('<uuid de otro>')   → ver su consumo
--   plant_summary('<uuid ajeno>')             → ver su planta
--   find_duplicate_diagnosis(...)             → sondear datos ajenos
--   refresh_plant_statuses()                  → cómputo gratis
--   freeze_plants_over_limit('<uuid ajeno>')  → congelarle las plantas
--
-- Las funciones de trigger no necesitan EXECUTE en absoluto:
-- las invoca el motor, no el usuario.
-- =====================================================

-- Funciones de trigger: nadie las llama directamente
revoke all on function set_updated_at()                from public, anon, authenticated;
revoke all on function handle_new_user()               from public, anon, authenticated;
revoke all on function apply_watering_feedback()       from public, anon, authenticated;
revoke all on function enforce_plant_limit()           from public, anon, authenticated;
revoke all on function schedule_followup()             from public, anon, authenticated;
revoke all on function apply_diagnosis_adjustment()    from public, anon, authenticated;
revoke all on function protect_plan_column()           from public, anon, authenticated;
revoke all on function sync_plan_from_subscription()   from public, anon, authenticated;

-- Solo backend (Edge Functions con service_role)
revoke all on function check_diagnosis_quota(uuid)         from public, anon, authenticated;
revoke all on function increment_diagnosis_usage(uuid)     from public, anon, authenticated;
revoke all on function find_duplicate_diagnosis(uuid,text) from public, anon, authenticated;
revoke all on function freeze_plants_over_limit(uuid)      from public, anon, authenticated;
revoke all on function can_notify(uuid, notification_kind) from public, anon, authenticated;
revoke all on function weather_context(uuid)               from public, anon, authenticated;

-- Solo jobs
revoke all on function apply_rain_events()        from public, anon, authenticated;
revoke all on function apply_heat_stress()        from public, anon, authenticated;
revoke all on function refresh_plant_statuses()   from public, anon, authenticated;

-- Estas SÍ las llama la app, pero necesitan verificar propiedad.
-- Sin el check, pasar un uuid ajeno devolvía datos de otro usuario.
revoke all on function plant_summary(uuid)            from public, anon;
revoke all on function recompute_plant_interval(uuid) from public, anon;
revoke all on function find_species(text, int)        from public;

grant execute on function plant_summary(uuid)            to authenticated;
grant execute on function recompute_plant_interval(uuid) to authenticated;
grant execute on function find_species(text, int)        to anon, authenticated;
grant execute on function delete_my_account()            to authenticated;


-- =====================================================
-- C. SEARCH_PATH FIJO + CHEQUEO DE PROPIEDAD
--
-- search_path mutable permite secuestrar una función:
-- si alguien crea una tabla con el mismo nombre en un
-- esquema anterior del path, la función usa la falsa.
-- =====================================================

create or replace function set_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function apply_watering_feedback()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
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

create or replace function compute_interval(
  p_base         int,
  p_min          int,
  p_max          int,
  p_location     location_type,
  p_light        light_distance,
  p_pot_size     pot_size,
  p_pot_material pot_material,
  p_sun          sun_exposure default null
) returns int language plpgsql stable
set search_path = public, pg_temp as $$
declare f numeric := 1.0;
begin
  if p_location = 'outdoor' then
    f := f * 0.85;
    if    p_sun = 'sol_todo_dia' then f := f * 0.65;
    elsif p_sun = 'sol_tarde'    then f := f * 0.75;
    elsif p_sun = 'sol_manana'   then f := f * 0.85;
    elsif p_sun = 'sombra'       then f := f * 1.20;
    end if;
  else
    if    p_light = 'junto_ventana' then f := f * 0.85;
    elsif p_light = 'lejos'         then f := f * 1.25;
    end if;
  end if;

  if    p_pot_size = 'chica'  then f := f * 0.80;
  elsif p_pot_size = 'grande' then f := f * 1.30;
  end if;

  if p_pot_material = 'greda' then f := f * 0.80; end if;

  if extract(month from now()) in (12,1,2) then
    f := f * (case when p_location = 'outdoor' then 0.70 else 0.80 end);
  elsif extract(month from now()) in (6,7,8) then
    f := f * (case when p_location = 'outdoor' then 1.60 else 1.40 end);
  end if;

  return greatest(p_min, least(p_max, round(p_base * f)::int));
end $$;

create or replace function find_species(p_query text, p_limit int default 10)
returns table (id uuid, common_name text, scientific_name text, image_url text, rank real)
language sql stable
set search_path = public, extensions, pg_temp as $$
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

-- plant_summary ahora verifica que la planta sea del usuario.
-- Antes devolvía datos de cualquier planta con solo saber su uuid.
create or replace function plant_summary(p_plant_id uuid)
returns table (
  nickname text, species_name text, status plant_status,
  days_until_watering int, interval_days int,
  last_diagnosis_at timestamptz, missing_data boolean
) language sql stable security definer
set search_path = public, pg_temp as $$
  select p.nickname, s.common_name, p.status,
         extract(day from p.next_watering_at - now())::int,
         p.current_interval_days,
         (select max(created_at) from diagnoses d where d.plant_id = p.id),
         (p.pot_size is null or p.pot_material is null)
  from plants p
  left join species s on s.id = p.species_id
  where p.id = p_plant_id
    and (p.user_id = (select auth.uid()) or (select auth.role()) = 'service_role');
$$;

-- Idem: sin el check, cualquiera podía recalcular la planta de otro
create or replace function recompute_plant_interval(p_plant_id uuid)
returns int language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_new int; v_owner uuid;
begin
  select user_id into v_owner from plants where id = p_plant_id;

  if v_owner is null then return null; end if;
  if (select auth.role()) <> 'service_role' and v_owner <> (select auth.uid()) then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;

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


-- =====================================================
-- D. RENDIMIENTO — auth.uid() envuelto en subconsulta
--
-- Escrito como auth.uid() = user_id, Postgres reevalúa la
-- función una vez POR FILA. Con (select auth.uid()) la evalúa
-- una sola vez por consulta. La diferencia se nota apenas
-- una tabla pasa de unos miles de registros.
-- =====================================================

drop policy if exists "own profile read"        on profiles;
drop policy if exists "own profile update"      on profiles;
drop policy if exists "own subs read"           on subscriptions;
drop policy if exists "own plants"              on plants;
drop policy if exists "own watering"            on watering_events;
drop policy if exists "own devices"             on devices;
drop policy if exists "own diagnoses read"      on diagnoses;
drop policy if exists "own usage read"          on usage_counters;
drop policy if exists "own notifications read"  on notifications_log;
drop policy if exists "own reservations read"   on reservations;
drop policy if exists "own readings read"       on sensor_readings;
drop policy if exists "insert own events"       on events;

create policy "own profile read" on profiles for select
  using ((select auth.uid()) = id);
create policy "own profile update" on profiles for update
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own subs read" on subscriptions for select
  using ((select auth.uid()) = user_id);

create policy "own plants" on plants for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own watering" on watering_events for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own devices" on devices for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own diagnoses read" on diagnoses for select
  using ((select auth.uid()) = user_id);

create policy "own usage read" on usage_counters for select
  using ((select auth.uid()) = user_id);

create policy "own notifications read" on notifications_log for select
  using ((select auth.uid()) = user_id);

create policy "own reservations read" on reservations for select
  using ((select auth.uid()) = user_id);

create policy "own readings read" on sensor_readings for select
  using (exists (select 1 from plants p
                 where p.id = sensor_readings.plant_id
                   and p.user_id = (select auth.uid())));

create policy "insert own events" on events for insert
  with check ((select auth.uid()) = user_id);

-- protect_plan_column con search_path y auth envuelto
create or replace function protect_plan_column()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (select auth.role()) = 'authenticated'
     and (new.plan is distinct from old.plan
          or new.plan_expires_at is distinct from old.plan_expires_at
          or new.founding_user is distinct from old.founding_user) then
    new.plan := old.plan;
    new.plan_expires_at := old.plan_expires_at;
    new.founding_user := old.founding_user;
  end if;
  return new;
end $$;

revoke all on function protect_plan_column() from public, anon, authenticated;


-- =====================================================
-- E. FOREIGN KEYS SIN ÍNDICE
--    Sin ellos, borrar un padre hace scan completo del hijo.
-- =====================================================
create index if not exists devices_plant_fk_idx    on devices(plant_id);
create index if not exists devices_user_fk_idx     on devices(user_id);
create index if not exists diagnoses_plant_fk_idx  on diagnoses(plant_id);
create index if not exists diagnoses_parent_fk_idx on diagnoses(parent_diagnosis_id);
create index if not exists plants_species_fk_idx   on plants(species_id);


-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- 1. Todas las vistas deben decir security_invoker=true
select c.relname as vista,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                 where option_name = 'security_invoker'), 'NO') as invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;

-- 2. Funciones que aún puede ejecutar 'authenticated'.
--    Solo deberían aparecer: find_species, plant_summary,
--    recompute_plant_interval, delete_my_account.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('authenticated', p.oid, 'execute')
order by 1;

-- 3. Funciones sin search_path fijo (debe salir vacío)
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by 1;


-- =====================================================
-- NOTA SOBRE HALLAZGOS QUE NO SON DE ESTE ESQUEMA
--
-- El linter reporta 'public.leads' con "RLS Policy Always True"
-- y una función 'public.rls_auto_enable()'. Ninguna de las dos
-- viene de los archivos de Flory.
--
-- "RLS Policy Always True" significa que cualquiera con la anon
-- key puede leer y escribir esa tabla. Si guarda correos o datos
-- de contacto, conviene revisarla antes de publicar nada.
--
-- Los avisos de "Unused Index" son ruido esperable: la base es
-- nueva y ningún índice se ha usado todavía. Se revisan después
-- de tener tráfico real, no ahora.
-- =====================================================