import "dotenv/config";
import { ZoomBrowserClient } from "./lib/zoom-browser";

// Script puntual (no commiteado): cancela en cadena las reuniones reales
// que quedaron colgadas del incidente cancelMeeting 2026-09-14, reusando
// una sola sesión de browser. Cada cancelMeeting() ya hace su propia
// verificación dura al final (revisa la lista "Próximas" real) — si una
// falla, se loguea y se sigue con las demás en vez de abortar todo.
const ZOOM_MEETING_IDS = [
  88309846292, // sábado 26/09
  84479923674, // jueves 01/10
  81796234141, // sábado 03/10
  85110356716, // jueves 08/10
  83245190852, // sábado 10/10
  87197056398, // jueves 15/10
  87448268924, // sábado 17/10
];

async function main() {
  const client = new ZoomBrowserClient();
  await client.open();

  const results: { id: number; ok: boolean; error?: string }[] = [];

  try {
    for (const id of ZOOM_MEETING_IDS) {
      console.log(`Cancelando ${id}...`);
      try {
        await client.cancelMeeting(id);
        console.log(`  OK — ${id} cancelada y verificada ausente de "Próximas".`);
        results.push({ id, ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`  FALLÓ — ${id}: ${message}`);
        results.push({ id, ok: false, error: message });
      }
    }
  } finally {
    await client.close();
  }

  console.log("\n--- Resumen ---");
  for (const r of results) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.id}${r.error ? ` — ${r.error}` : ""}`);
  }

  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
