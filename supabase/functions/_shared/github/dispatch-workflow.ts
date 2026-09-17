// Repo fijo a propósito: no es secreto ni va a cambiar, no gana nada siendo
// env var (mismo criterio que otras constantes de este proyecto).
const OWNER = "GuilloSGit";
const REPO = "my-app";
const REF = "master";

export interface DispatchWorkflowConfig {
  githubPat: string;
}

export type DispatchResult = { ok: true } | { ok: false; error: string };

// fetch inyectado a propósito, mismo patrón que makeZoomClient en
// ../zoom/client.ts — permite testear sin pegarle a la API real de GitHub.
// Genérica desde 2026-09-17 (antes solo disparaba zoom-apply-browser.yml)
// para poder reusarla también con zoom-session-check.yml sin duplicar
// código — ver zoom-session-check-dispatch/index.ts.
export async function dispatchWorkflow(
  config: DispatchWorkflowConfig,
  workflowFile: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchResult> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.githubPat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: REF }),
    },
  );

  // GitHub devuelve 204 sin body en éxito.
  if (res.status === 204) return { ok: true };

  const error = await res.text().catch(() => `HTTP ${res.status}`);
  return { ok: false, error: error || `HTTP ${res.status}` };
}

// Wrapper de compatibilidad: firma vieja, usado por zoom-apply-dispatch.
export type DispatchZoomApplyConfig = DispatchWorkflowConfig;

export async function dispatchZoomApplyWorkflow(
  config: DispatchZoomApplyConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<DispatchResult> {
  return dispatchWorkflow(config, "zoom-apply-browser.yml", fetchImpl);
}
