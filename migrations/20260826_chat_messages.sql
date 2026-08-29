-- FLORY - Chat con la planta (fase scaffold).
-- Aplicar despues de: tables.sql -> species_feed.sql -> security.sql ->
-- 20260825_onboarding.sql -> 20260825_profile_display_name.sql ->
-- 20260825_create_plant.sql -> 20260825_recompute_sin_especie.sql
--
-- Por que existe:
--   La pestana Chat deja al usuario conversar con su planta en primera persona. En
--   esta fase las respuestas son plantillas de voz (costo cero, como plant-messages),
--   pero el historial se persiste para que la conversacion sobreviva al cierre de la
--   app y para que la Fase 2 (Edge Function con modelo) solo tenga que cambiar quien
--   escribe la fila `role='plant'`.
--
-- Voz: `role='user'` es lo que escribe la persona; `role='plant'` es Flory. No hay
--   `assistant` ni `system`: el producto es la planta hablando, no un asistente.
--
-- IMPORTANTE (endurecer en Fase 2):
--   Hoy el cliente inserta AMBOS roles porque la respuesta es una plantilla generada
--   en el dispositivo. Cuando el modelo entre por la Edge Function, la fila `plant`
--   pasara a escribirse con `service_role` (salta RLS) y esta policy de insert debe
--   restringirse a `role = 'user'` para que el cliente no pueda falsificar respuestas.

begin;

create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  plant_id    uuid not null references public.plants(id)   on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,

  role        text not null check (role in ('user', 'plant')),
  content     text not null check (char_length(content) between 1 and 2000),

  -- Solo se llenan cuando la respuesta viene del modelo (Fase 2). En scaffold van null.
  tokens      int,
  model       text,

  created_at  timestamptz default now()
);

-- El chat siempre se lee por planta y en orden cronologico.
create index if not exists chat_messages_plant_idx
  on public.chat_messages (plant_id, created_at);

-- FK sin indice = seq scan al borrar un perfil. El linter de Supabase lo marca.
create index if not exists chat_messages_user_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "own chat read"   on public.chat_messages;
drop policy if exists "own chat insert" on public.chat_messages;

-- auth.uid() envuelto en subquery: se evalua una vez por consulta, no por fila (mismo
-- patron que el resto de security.sql).
create policy "own chat read" on public.chat_messages for select
  using ((select auth.uid()) = user_id);

-- Insertar solo en conversaciones de una planta propia. El exists ata el mensaje a un
-- plant_id del mismo usuario: sin el, se podria colgar un mensaje de la planta de otro.
create policy "own chat insert" on public.chat_messages for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.plants p
      where p.id = chat_messages.plant_id
        and p.user_id = (select auth.uid())
    )
  );

-- Sin update ni delete desde el cliente: un chat no se edita ni se borra a mano. El
-- borrado real ocurre por cascade cuando se elimina la planta.
revoke all on table public.chat_messages from public, anon;
grant select, insert on table public.chat_messages to authenticated;

notify pgrst, 'reload schema';

commit;
