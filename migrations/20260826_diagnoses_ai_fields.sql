-- FLORY - Campos que el diagnóstico por IA necesita en `diagnoses`.
--
-- Aplicar después de tables.sql → species_feed.sql → security.sql y del resto de
-- migrations/20260825_*. No toca RLS ni grants: `diagnoses` ya solo lo escribe la
-- Edge Function con service_role (security.sql), y el cliente lo lee vía RLS.
--
-- Dos columnas que el esquema de salida del modelo produce (INTEGRACION_IA.MD §4 y §6)
-- pero que hoy no tienen dónde caer:
--   not_recoverable  → qué daño ya no se revierte (null si todo es recuperable).
--   user_action      → qué hizo la persona con el diagnóstico: el dato más valioso
--                      para saber si el prompt acierta (INTEGRACION_IA.MD:506-508).

begin;

alter table diagnoses
  add column if not exists not_recoverable text,
  add column if not exists user_action     text;

-- Recorta el universo de user_action a lo que la UI puede escribir. Se deja abierto a
-- null: un diagnóstico recién creado todavía no tiene acción del usuario.
alter table diagnoses
  drop constraint if exists diagnoses_user_action_chk;
alter table diagnoses
  add constraint diagnoses_user_action_chk
  check (user_action is null or user_action in ('confirmo', 'corrigio', 'no_sabe', 'abandono'));

-- El cliente solo tiene policy de SELECT sobre `diagnoses` (security.sql:296): no puede
-- hacer UPDATE directo. Pero `user_action` (confirmó / corrigió / no sabe / abandonó) se
-- captura en la pantalla de resultado y es el dato más valioso para calibrar el prompt.
-- Una RPC security definer, acotada a un solo campo y con chequeo de dueño, deja escribirlo
-- sin abrir un UPDATE general sobre la tabla.
create or replace function set_diagnosis_user_action(p_diagnosis_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action is not null and p_action not in ('confirmo', 'corrigio', 'no_sabe', 'abandono') then
    raise exception 'user_action_invalida';
  end if;

  update diagnoses
     set user_action = p_action
   where id = p_diagnosis_id
     and user_id = auth.uid();   -- solo el dueño; si no calza, no actualiza ninguna fila
end $$;

revoke all on function set_diagnosis_user_action(uuid, text) from public, anon;
grant execute on function set_diagnosis_user_action(uuid, text) to authenticated;

-- PostgREST cachea el esquema; sin esto las columnas nuevas no aparecen hasta reiniciar.
notify pgrst, 'reload schema';

commit;
