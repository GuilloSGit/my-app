import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { SESSION_FILE } from "./zoom-browser";

// La sesión de Zoom vive en la tabla `zoom_session_state` (una fila, solo
// service_role). Antes se restauraba siempre desde los GitHub Secrets
// ZOOM_SESSION_STATE_B64_*, o sea cada corrida usaba la misma copia vieja de
// la captura y Zoom la invalidaba en 2-4hs (2026-09-19/21). Ahora:
//   - al arrancar: `pullSession` baja la última versión guardada;
//   - al terminar (solo si la sesión sigue activa): `pushSession` sube la
//     versión renovada por Zoom, para que la próxima corrida parta de ella.
// Los secrets quedan solo como semilla si la tabla está vacía.
// Los 3 workflows comparten `concurrency: zoom-account`, así que no hay
// dos corridas leyendo/escribiendo a la vez.

// true si había una sesión guardada en la base y se dejó en SESSION_FILE.
export async function pullSession(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from("zoom_session_state").select("state, updated_at").eq("id", 1).maybeSingle();
  if (error) throw new Error(`No se pudo leer zoom_session_state: ${error.message}`);
  if (!data) {
    console.log("[session] zoom_session_state vacía — se usa la sesión local/semilla.");
    return false;
  }
  mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(data.state));
  console.log(`[session] sesión restaurada desde la base (guardada ${data.updated_at}).`);
  return true;
}

export async function pushSession(supabase: SupabaseClient, state: unknown, source: string): Promise<void> {
  const { error } = await supabase
    .from("zoom_session_state")
    .upsert({ id: 1, state, source, updated_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar zoom_session_state: ${error.message}`);
  console.log(`[session] sesión guardada en la base (source=${source}).`);
}

// Para upload-session: sube el archivo capturado a mano.
export async function pushSessionFile(supabase: SupabaseClient, source: string): Promise<void> {
  await pushSession(supabase, JSON.parse(readFileSync(SESSION_FILE, "utf8")), source);
}
