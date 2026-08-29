import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/**
 * Chat con la planta.
 *
 * El cliente solo LEE `chat_messages` e INVOCA la Edge Function `chat`. Toda la escritura
 * (el turno del usuario y la respuesta de la planta) la hace `chat` con service_role,
 * después de validar propiedad y el tope diario. La RLS deja al cliente en solo lectura
 * (migración 20260827_chat_server_writes.sql), así que no puede falsificar respuestas ni
 * saltarse el cupo.
 */

export type ChatRole = 'user' | 'plant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

type ChatRow = {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type ChatErrorKind = 'offline' | 'no_session' | 'quota' | 'generic';

/** Copia de error en voz de Flory, mismo espíritu que `lib/ai.ts`. */
export const CHAT_ERROR_COPY: Record<ChatErrorKind, string> = {
  offline: 'Ahora mismo no puedo escucharte: estás sin conexión. Lo retomamos cuando vuelva la red.',
  no_session: 'Se cerró tu sesión. Vuelve a entrar para que podamos seguir hablando.',
  quota: 'Hoy conversamos harto y necesito descansar un poco. Sigamos mañana, ¿te parece?',
  generic: 'Algo se me enredó al responderte. ¿Lo intentamos otra vez?',
};

/** Error tipado para que la UI distinga cupo (banner) de un fallo pasajero. */
export class ChatError extends Error {
  kind: ChatErrorKind;
  constructor(kind: ChatErrorKind) {
    super(CHAT_ERROR_COPY[kind]);
    this.kind = kind;
  }
}

const HISTORY_LIMIT = 100;

export function useChatHistory(plantId: string | null, offline: boolean) {
  return useQuery({
    queryKey: queryKeys.chatMessages(plantId ?? 'none'),
    enabled: plantId !== null && !offline,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, created_at')
        .eq('plant_id', plantId!)
        .order('created_at', { ascending: true })
        .limit(HISTORY_LIMIT);

      if (error) throw error;
      return (data ?? []).map(toChatMessage);
    },
  });
}

function toChatMessage(row: ChatRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

type SendVars = { text: string };

/**
 * Envía un mensaje: invoca `chat` y deja que el servidor persista los dos turnos.
 *
 * Optimista: el mensaje del usuario aparece en el acto y el input se limpia. Al terminar
 * se refresca el historial para traer las filas reales (usuario + planta). Si algo falla,
 * se revierte y el error viaja como `ChatError` para que la pantalla lo muestre.
 */
export function useSendChatMessage(params: { plantId: string }) {
  const { plantId } = params;
  const queryClient = useQueryClient();
  const key = queryKeys.chatMessages(plantId);

  return useMutation({
    mutationFn: async ({ text }: SendVars) => {
      const content = text.trim();
      if (!content) return;

      const { data, error } = await supabase.functions.invoke('chat', {
        body: { plantId, text: content },
      });

      if (error) {
        if (error instanceof FunctionsFetchError) throw new ChatError('offline');
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => ({}));
          throw chatErrorFromCode(body?.error);
        }
        throw new ChatError('generic');
      }

      if (data?.error) throw chatErrorFromCode(data.error);
    },

    onMutate: async ({ text }: SendVars) => {
      const content = text.trim();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatMessage[]>(key) ?? [];

      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(key, [...previous, optimistic]);

      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

function chatErrorFromCode(code: unknown): ChatError {
  if (code === 'quota') return new ChatError('quota');
  if (code === 'no_session') return new ChatError('no_session');
  return new ChatError('generic');
}
