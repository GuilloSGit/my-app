import { requireAdmin } from "../_shared/admin-auth.ts";
import { dispatchZoomApplyWorkflow } from "../_shared/github/dispatch-workflow.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

// Llamada desde el botón "Sincronizar ahora" del admin UI (Fase 4): dispara
// el workflow zoom-apply-browser vía la API de GitHub Actions en vez de
// esperar al backstop de reconcile cada 2 días. Ver "Jobs" en
// ZOOM_AUTOMATION.md para el diseño completo.
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const admin = await requireAdmin(req, {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
    adminEmailsEnv: Deno.env.get("ADMIN_EMAILS"),
  });
  if (admin instanceof Response) return admin;

  const githubPat = Deno.env.get("GITHUB_PAT");
  if (!githubPat) {
    return new Response(JSON.stringify({ error: "GITHUB_PAT no configurado" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const result = await dispatchZoomApplyWorkflow({ githubPat });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
