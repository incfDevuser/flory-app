-- FLORY - recompute_plant_interval deja de ignorar a las plantas sin especie.
-- Aplicar despues de: tables.sql -> species_feed.sql -> security.sql ->
-- 20260825_onboarding.sql -> 20260825_profile_display_name.sql ->
-- 20260825_create_plant.sql
--
-- Por que:
--   La version de security.sql hace `join species` (inner). Para una planta sin
--   species_id la consulta no devuelve fila, v_new queda null y la funcion retorna sin
--   tocar nada.
--
--   Eso deja un hueco silencioso: "No se cual es" es una opcion legitima del onboarding
--   y `create_plant` si calcula bien el intervalo inicial con archetipos. Pero desde ahi
--   cualquier cambio de entorno de esa planta -cambiar la maceta de chica a grande, o
--   moverla lejos de la ventana- no volvia a recalcular el riego. El usuario corrige el
--   dato, la app le agradece, y el riego sigue igual.
--
--   Los archetipos son los mismos que ya usan `complete_plant_onboarding` y
--   `create_plant`, para que una planta sin especie se comporte igual sin importar por
--   donde paso.

begin;

create or replace function public.recompute_plant_interval(p_plant_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new int;
  v_owner uuid;
begin
  select user_id into v_owner from public.plants where id = p_plant_id;

  if v_owner is null then return null; end if;

  -- Sin este check, cualquiera podia recalcular la planta de otro.
  if (select auth.role()) <> 'service_role' and v_owner <> (select auth.uid()) then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;

  -- `left join` + coalesce: si la planta no tiene especie se usan las medianas del
  -- catalogo chileno como base, y el motor sigue aplicando estacion, ubicacion, luz,
  -- sol, maceta y material sobre ellas.
  select public.compute_interval(
           coalesce(s.base_watering_days, case when p.location = 'indoor' then 7 else 5 end),
           coalesce(s.min_watering_days,  case when p.location = 'indoor' then 3 else 2 end),
           coalesce(s.max_watering_days,  case when p.location = 'indoor' then 18 else 8 end),
           p.location,
           p.light_distance,
           p.pot_size,
           p.pot_material,
           p.sun_exposure
         )
    into v_new
  from public.plants p
  left join public.species s on s.id = p.species_id
  where p.id = p_plant_id;

  if v_new is null then return null; end if;

  update public.plants set
    current_interval_days = v_new,
    next_watering_at      = coalesce(last_watered_at, now()) + (v_new || ' days')::interval
  where id = p_plant_id;

  return v_new;
end;
$$;

revoke all on function public.recompute_plant_interval(uuid) from public, anon;
grant execute on function public.recompute_plant_interval(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
