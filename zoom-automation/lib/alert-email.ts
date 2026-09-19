// Aviso por email vía Resend, compartido por drift-check y check-session.
// Reusa la cuenta de Resend del proyecto ferreterias (Galpón Digital) —
// `RESEND_API_KEY` es un secret propio de este repo. Sin la variable no
// falla: avisa por consola y el resultado queda igual en el dashboard.
const FROM = "Galpón Digital <no-reply@galpon-digital.com.ar>";
const TO = "guillermoandrada@gmail.com";

export async function sendAlertEmail(subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[alert-email] RESEND_API_KEY no configurada — no se manda el email, solo queda en el dashboard.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TO, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
}

// URL de la corrida actual de GitHub Actions (donde están los artifacts,
// ej. la captura de pantalla). null fuera de CI.
export function currentRunUrl(): string | null {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

// 'schedule' (cron) o 'manual' (botón / gh workflow run); null fuera de CI.
export function currentRunSource(): "schedule" | "manual" | null {
  const event = process.env.GITHUB_EVENT_NAME;
  if (!event) return null;
  return event === "schedule" ? "schedule" : "manual";
}
