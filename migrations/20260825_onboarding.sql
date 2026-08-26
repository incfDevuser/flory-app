-- FLORY - Onboarding funcional.
-- Aplicar despues de: tables.sql -> species_feed.sql -> security.sql.
-- Esta migracion ya fue aplicada al proyecto remoto el 2026-08-25.

begin;

create extension if not exists pg_trgm with schema extensions;

-- Busqueda con tildes, aliases, subcadenas y errores de escritura. `verified_cl`
-- viaja con el resultado para que la UI avise cuando los tiempos son aproximados.
drop function if exists public.find_species(text, integer);

create function public.find_species(
  p_query text,
  p_limit integer default 10
)
returns table (
  id uuid,
  common_name text,
  scientific_name text,
  image_url text,
  verified_cl boolean,
  rank real
)
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  with query as (
    select trim(unaccent(lower(coalesce(p_query, '')))) as term
  )
  select
    s.id,
    s.common_name,
    s.scientific_name,
    s.image_url,
    coalesce(s.verified_cl, false) as verified_cl,
    score.rank
  from public.species s
  cross join query q
  cross join lateral (
    select coalesce(
      max(similarity(unaccent(lower(alias)), q.term)),
      0::real
    ) as alias_rank
    from unnest(coalesce(s.aliases, '{}'::text[])) as alias
  ) alias_score
  cross join lateral (
    select greatest(
      ts_rank(
        to_tsvector(
          'spanish',
          unaccent(lower(s.common_name || ' ' || s.scientific_name))
        ),
        plainto_tsquery('spanish', q.term)
      ),
      similarity(unaccent(lower(s.common_name)), q.term),
      similarity(unaccent(lower(s.scientific_name)), q.term),
      alias_score.alias_rank
    )::real as rank
  ) score
  where s.active = true
    and q.term <> ''
    and (
      to_tsvector(
        'spanish',
        unaccent(lower(s.common_name || ' ' || s.scientific_name))
      ) @@ plainto_tsquery('spanish', q.term)
      or unaccent(lower(s.common_name)) like '%' || q.term || '%'
      or unaccent(lower(s.scientific_name)) like '%' || q.term || '%'
      or exists (
        select 1
        from unnest(coalesce(s.aliases, '{}'::text[])) as alias
        where unaccent(lower(alias)) like '%' || q.term || '%'
      )
      or score.rank >= 0.28
    )
  order by
    case
      when unaccent(lower(s.common_name)) = q.term then 0
      when unaccent(lower(s.common_name)) like q.term || '%' then 1
      else 2
    end,
    score.rank desc,
    s.common_name asc
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

revoke all on function public.find_species(text, integer) from public;
grant execute on function public.find_species(text, integer) to anon, authenticated;

-- Crea la primera planta y completa el perfil en una unica transaccion. No recibe
-- user_id: la propiedad siempre se toma de auth.uid(). El lock del perfil y la
-- devolucion de la primera planta existente hacen idempotente un retry tras timeout.
create or replace function public.complete_plant_onboarding(
  p_nickname text,
  p_location public.location_type,
  p_species_id uuid default null,
  p_window_orientation public.window_orientation default null,
  p_light_distance public.light_distance default null,
  p_sun_exposure public.sun_exposure default null,
  p_rain_shelter public.rain_shelter default null,
  p_pot_size public.pot_size default null,
  p_pot_material public.pot_material default null,
  p_last_watered_choice text default 'unknown'
)
returns table (
  plant_id uuid,
  interval_days integer,
  next_watering_at timestamptz,
  status public.plant_status,
  approximate boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_exists boolean;
  v_plant_id uuid;
  v_nickname text;
  v_base integer;
  v_min integer;
  v_max integer;
  v_interval integer;
  v_last_watered timestamptz;
  v_next_watering timestamptz;
  v_status public.plant_status;
  v_approximate boolean;
  v_window_orientation public.window_orientation;
  v_light_distance public.light_distance;
  v_sun_exposure public.sun_exposure;
  v_rain_shelter public.rain_shelter;
begin
  if v_user_id is null then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;

  v_nickname := trim(coalesce(p_nickname, ''));
  if v_nickname = '' then
    raise exception 'nombre_requerido' using errcode = 'P0001';
  end if;
  if char_length(v_nickname) > 60 then
    raise exception 'nombre_demasiado_largo' using errcode = 'P0001';
  end if;
  if p_location is null then
    raise exception 'ubicacion_requerida' using errcode = 'P0001';
  end if;
  if coalesce(p_last_watered_choice, 'unknown') not in (
    'today', 'few_days', 'over_week', 'unknown'
  ) then
    raise exception 'ultimo_riego_invalido' using errcode = 'P0001';
  end if;

  select true into v_profile_exists
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'perfil_no_encontrado' using errcode = 'P0001';
  end if;

  select
    p.id,
    p.current_interval_days,
    p.next_watering_at,
    p.status,
    (p.species_id is null or coalesce(not s.verified_cl, true))
  into
    v_plant_id,
    v_interval,
    v_next_watering,
    v_status,
    v_approximate
  from public.plants p
  left join public.species s on s.id = p.species_id
  where p.user_id = v_user_id
    and p.archived = false
  order by p.created_at asc
  limit 1;

  if found then
    update public.profiles
    set onboarded_at = coalesce(onboarded_at, now())
    where id = v_user_id;

    plant_id := v_plant_id;
    interval_days := v_interval;
    next_watering_at := v_next_watering;
    status := v_status;
    approximate := v_approximate;
    return next;
    return;
  end if;

  if p_location = 'indoor' then
    v_window_orientation := p_window_orientation;
    v_light_distance := p_light_distance;
    v_sun_exposure := null;
    v_rain_shelter := null;
  else
    v_window_orientation := null;
    v_light_distance := null;
    v_sun_exposure := p_sun_exposure;
    v_rain_shelter := p_rain_shelter;
  end if;

  if p_species_id is not null then
    select
      s.base_watering_days,
      s.min_watering_days,
      s.max_watering_days,
      not coalesce(s.verified_cl, false)
    into v_base, v_min, v_max, v_approximate
    from public.species s
    where s.id = p_species_id
      and s.active = true;

    if not found then
      raise exception 'especie_no_disponible' using errcode = 'P0001';
    end if;
  else
    -- Medianas de las especies del catalogo chileno. Son valores base: el motor
    -- todavia aplica estacion, ubicacion, luz, sol, maceta y material.
    if p_location = 'indoor' then
      v_base := 7;
      v_min := 3;
      v_max := 18;
    else
      v_base := 5;
      v_min := 2;
      v_max := 8;
    end if;
    v_approximate := true;
  end if;

  v_interval := public.compute_interval(
    v_base,
    v_min,
    v_max,
    p_location,
    v_light_distance,
    p_pot_size,
    p_pot_material,
    v_sun_exposure
  );

  v_last_watered := case coalesce(p_last_watered_choice, 'unknown')
    when 'today' then now()
    when 'few_days' then now() - interval '3 days'
    when 'over_week' then now() - interval '10 days'
    when 'unknown' then null
  end;

  v_next_watering := coalesce(v_last_watered, now())
    + make_interval(days => v_interval);

  v_status := case
    when v_next_watering <= now() - interval '3 days'
      then 'urgente'::public.plant_status
    when v_next_watering <= now() + interval '1 day'
      then 'atencion'::public.plant_status
    else 'bien'::public.plant_status
  end;

  insert into public.plants (
    user_id,
    species_id,
    nickname,
    location,
    window_orientation,
    light_distance,
    sun_exposure,
    rain_shelter,
    pot_size,
    pot_material,
    current_interval_days,
    last_watered_at,
    next_watering_at,
    status
  ) values (
    v_user_id,
    p_species_id,
    v_nickname,
    p_location,
    v_window_orientation,
    v_light_distance,
    v_sun_exposure,
    v_rain_shelter,
    p_pot_size,
    p_pot_material,
    v_interval,
    v_last_watered,
    v_next_watering,
    v_status
  ) returning id into v_plant_id;

  update public.profiles
  set onboarded_at = now()
  where id = v_user_id;

  plant_id := v_plant_id;
  interval_days := v_interval;
  next_watering_at := v_next_watering;
  status := v_status;
  approximate := v_approximate;
  return next;
end;
$$;

revoke all on function public.compute_interval(
  integer,
  integer,
  integer,
  public.location_type,
  public.light_distance,
  public.pot_size,
  public.pot_material,
  public.sun_exposure
) from public, anon, authenticated;

revoke all on function public.complete_plant_onboarding(
  text,
  public.location_type,
  uuid,
  public.window_orientation,
  public.light_distance,
  public.sun_exposure,
  public.rain_shelter,
  public.pot_size,
  public.pot_material,
  text
) from public, anon, authenticated;

grant execute on function public.complete_plant_onboarding(
  text,
  public.location_type,
  uuid,
  public.window_orientation,
  public.light_distance,
  public.sun_exposure,
  public.rain_shelter,
  public.pot_size,
  public.pot_material,
  text
) to authenticated;

notify pgrst, 'reload schema';

commit;
