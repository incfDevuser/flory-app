-- FLORY - El chat pasa a escribirse solo desde el servidor.
-- Aplicar despues de: 20260826_chat_messages.sql
--
-- Por que existe:
--   En la fase scaffold el cliente insertaba los dos roles ('user' y 'plant') porque la
--   respuesta era una plantilla generada en el dispositivo. Ahora la respuesta la genera
--   la Edge Function `chat` con el modelo, y escribe ambas filas con service_role (salta
--   RLS). Si el cliente conservara el insert, podria falsificar respuestas de la planta o
--   saltarse el tope diario insertando a mano.
--
--   Resultado: el cliente queda en SOLO LECTURA sobre chat_messages. Toda escritura pasa
--   por `chat`, que valida propiedad y cupo.

begin;

-- El cliente ya no inserta: la funcion `chat` (service_role) es la unica que escribe.
drop policy if exists "own chat insert" on public.chat_messages;

revoke insert on table public.chat_messages from authenticated;

-- La lectura sigue igual: cada quien ve su propia conversacion (policy "own chat read").

notify pgrst, 'reload schema';

commit;
