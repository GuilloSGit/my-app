// Necesario en cualquier Edge Function invocada desde el browser vía
// supabase.functions.invoke (a diferencia de reconcile/zoom-apply, que solo
// las llama el cron/GitHub Actions server-to-server, nunca un navegador) —
// el browser manda un preflight OPTIONS antes del POST real cuando hay un
// header Authorization custom, y sin estos headers en la respuesta lo
// bloquea como falla de CORS antes de que llegue ningún body de error.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
