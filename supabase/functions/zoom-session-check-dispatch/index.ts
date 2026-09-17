import { requireAdmin } from "../_shared/admin-auth.ts";
import { dispatchWorkflow } from "../_shared/github/dispatch-workflow.ts";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

// Llamada desde el botón "Verificar sesión de Zoom" del admin UI
// (/dashboard/automatizacion, 2026-09-17): dispara el workflow
// zoom-session-check vía la API de GitHub Actions, mismo mecanismo que
// zoom-apply-dispatch (botón "Sincronizar ahora") pero apuntando a un
// workflow distinto — ver _shared/github/dispatch-workflow.ts.
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

  const result = await dispatchWorkflow({ githubPat }, "zoom-session-check.yml");

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
