// Cliente mínimo de la OpenAI Responses API vía fetch. Sin SDK: una sola llamada, y así
// no arrastramos dependencias ni sorpresas de versión al runtime de Deno.

/** Errores con código estable para que el cliente los mapee a la voz de Flory (§5). */
export class OpenAIError extends Error {
  code:
    | 'timeout'
    | 'content_filter'
    | 'invalid_image_format'
    | 'image_too_large'
    | 'invalid_json'
    | 'generic';
  constructor(code: OpenAIError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export type JsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

export type ResponsesParams = {
  model: string;
  /** Prefijo estático cacheable: instrucciones (+ catálogo en identify). */
  instructions: string;
  /** Texto variable (contexto del usuario) y las imágenes firmadas. Siempre al final. */
  userText: string;
  images: Array<{
    label: string;
    imageUrl: string;
    detail: 'low' | 'high';
  }>;
  format: JsonSchemaFormat;
  maxOutputTokens: number;
  /**
   * Bajo para clasificación visual: el default triplica costo y latencia (§3).
   *
   * `minimal` NO existe en esta familia de modelos; Luna responde 400
   * `unsupported_value` y la llamada se cae entera. Los valores aceptados son estos.
   */
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  promptCacheKey: string;
  /** Corta a los 15 s: pasado eso, mejor pedir otra foto que dejar el spinner girando. */
  timeoutMs?: number;
};

export type ResponsesResult<T> = {
  parsed: T;
  inputTokens: number;
  outputTokens: number;
};

const ENDPOINT = 'https://api.openai.com/v1/responses';

export async function callResponses<T>(params: ResponsesParams): Promise<ResponsesResult<T>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new OpenAIError('generic', 'Falta OPENAI_API_KEY en el entorno.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 15_000);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        instructions: params.instructions,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: params.userText },
              ...params.images.flatMap((image) => [
                { type: 'input_text', text: image.label },
                {
                  type: 'input_image',
                  image_url: image.imageUrl,
                  detail: image.detail,
                },
              ]),
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: params.format.name,
            strict: true,
            schema: params.format.schema,
          },
          verbosity: 'low',
        },
        reasoning: { effort: params.reasoningEffort },
        max_output_tokens: params.maxOutputTokens,
        store: false,
        prompt_cache_key: params.promptCacheKey,
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new OpenAIError('timeout', 'La llamada al modelo superó el tiempo límite.');
    }
    throw new OpenAIError('generic', String(err));
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const code = detail?.error?.code as string | undefined;
    if (code === 'invalid_image_format' || code === 'image_too_large') {
      throw new OpenAIError(code, detail?.error?.message ?? code);
    }
    throw new OpenAIError('generic', detail?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();

  // Un rechazo por filtro de contenido llega como bloque `refusal`, no como texto.
  const refusal = findRefusal(data);
  if (refusal) throw new OpenAIError('content_filter', refusal);

  const text = extractOutputText(data);
  if (!text) throw new OpenAIError('invalid_json', 'El modelo no devolvió texto.');

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new OpenAIError('invalid_json', 'El modelo devolvió un JSON inválido.');
  }

  return {
    parsed,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  };
}

/** El texto estructurado sale en `output_text`, o hilando los bloques de `output`. */
function extractOutputText(data: any): string | null {
  if (typeof data?.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text;
  }
  const output = data?.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'output_text' && typeof block.text === 'string') {
        return block.text;
      }
    }
  }
  return null;
}

function findRefusal(data: any): string | null {
  const output = data?.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'refusal' && typeof block.refusal === 'string') {
        return block.refusal;
      }
    }
  }
  return null;
}
