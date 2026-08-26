-- FLORY - Crear plantas despues de la primera.
-- Aplicar despues de: tables.sql -> species_feed.sql -> security.sql ->
-- 20260825_onboarding.sql -> 20260825_profile_display_name.sql
--
-- Por que existe:
--   `complete_plant_onboarding` crea SOLO la primera planta. Si ya hay una sin
--   archivar la devuelve y no inserta nada, para que un reintento tras un timeout no
--   duplique la planta. Eso lo vuelve inservible para la segunda en adelante.
--
--   El cliente tampoco puede insertar por su cuenta: `plants.current_interval_days` es
--   `not null` sin default, y `compute_interval` esta revocado de anon y authenticated
--   (20260825_onboarding.sql). Insertar con un numero fijo se saltaria ubicacion, luz,
--   maceta y estacion. La estacion sola cambia el intervalo un 40% en interior y un 60%
--   en exterior, asi que el error seria invisible y grave.
--
--   `create_plant` reusa la misma aritmetica del onboarding, en una transaccion, sin
--   aritmetica en el cliente.

begin;

create or replace function public.create_plant(
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
  -- La propiedad sale siempre de auth.uid(): la funcion no recibe user_id, asi que no
  -- hay forma de crear una planta a nombre de otra persona.
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
  where id = v_user_id;

  if not found then
    raise exception 'perfil_no_encontrado' using errcode = 'P0001';
  end if;

  -- Los campos del modo contrario no se guardan: una planta de interior no puede
  -- arrastrar una exposicion al sol que nadie respondio.
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
    -- Medianas del catalogo chileno. Son valores base: el motor todavia aplica
    -- estacion, ubicacion, luz, sol, maceta y material.
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

  -- El trigger `plants_limit` corre aca y lanza `limite_plantas_alcanzado` si el plan
  -- ya no admite mas. La app lo traduce a un mensaje antes de pedir datos.
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

  plant_id := v_plant_id;
  interval_days := v_interval;
  next_watering_at := v_next_watering;
  status := v_status;
  approximate := v_approximate;
  return next;
end;
$$;

revoke all on function public.create_plant(
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
) from public, anon;

grant execute on function public.create_plant(
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

-- Higiene: `security.sql` concede delete_my_account a authenticated pero nunca la
-- revoco de PUBLIC, y Postgres da EXECUTE a PUBLIC por defecto. Hoy es inofensiva
-- porque el cuerpo es `delete from auth.users where id = auth.uid()` y con anon eso
-- compara contra null, pero deja un endpoint de borrado de cuenta abierto sin sesion.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';

commit;
