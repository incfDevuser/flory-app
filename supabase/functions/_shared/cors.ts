// CORS para invocar las funciones desde la app (y desde el navegador en web).
// `supabase.functions.invoke` manda un preflight OPTIONS; sin estas cabeceras, falla
// antes de llegar a la lógica.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Respuesta JSON con CORS ya puesto. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
