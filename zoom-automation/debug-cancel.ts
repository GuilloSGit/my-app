import "dotenv/config";
import { ZoomBrowserClient } from "./lib/zoom-browser";

// Script puntual de diagnóstico (no commiteado) para el incidente
// cancelMeeting 2026-09-14 — bypasea el outbox y llama directo al método
// real, contra una reunión real ya conocida, para verla en vivo con
// ZOOM_HEADFUL=1 ZOOM_DEBUG_PAUSE=1.
const ZOOM_MEETING_ID = 87552911742;

async function main() {
  const client = new ZoomBrowserClient();
  await client.open();
  try {
    await client.cancelMeeting(ZOOM_MEETING_ID);
    console.log(`cancelMeeting(${ZOOM_MEETING_ID}) terminó sin excepción.`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
