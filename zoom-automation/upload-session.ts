import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { SESSION_FILE } from "./lib/zoom-browser";

// Reemplaza la secuencia manual (base64 | tr -d '\n' > ..., split -b 20000
// -d -a 2 ..., loop de `gh secret set`) que se corrió a mano el
// 2026-09-17 para resubir la sesión de Zoom a GitHub Secrets después de
// recapturarla — mismo procedimiento, un solo comando. Nunca imprime el
// contenido de la sesión: cada pedazo se pasa a `gh secret set` por
// stdin, nunca por argumento (evita que quede en el historial de shell o
// en `ps`).
const CHUNK_SIZE = 20_000;
// Los workflows (zoom-apply-browser, zoom-session-check, zoom-drift-check)
// concatenan ZOOM_SESSION_STATE_B64_1..MAX_WORKFLOW_SECRETS; un secret
// inexistente cuenta como texto vacío, así que una sesión más chica no
// requiere tocarlos — pero SÍ borrar los pedazos viejos que sobran (ver abajo).
const MAX_WORKFLOW_SECRETS = 13;
const SECRET_PREFIX = "ZOOM_SESSION_STATE_B64_";

function chunk(str: string, size: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < str.length; i += size) parts.push(str.slice(i, i + size));
  return parts;
}

function main() {
  const raw = readFileSync(SESSION_FILE);
  const b64 = raw.toString("base64");
  const parts = chunk(b64, CHUNK_SIZE);

  console.log(`Sesión codificada en ${parts.length} pedazo(s) de hasta ${CHUNK_SIZE} caracteres.`);

  if (parts.length > MAX_WORKFLOW_SECRETS) {
    console.warn(
      `\n⚠️  La sesión necesita ${parts.length} pedazos y los workflows solo leen ${MAX_WORKFLOW_SECRETS}.\n` +
        `   Hay que agregar los ZOOM_SESSION_STATE_B64_N faltantes a\n` +
        `   .github/workflows/zoom-apply-browser.yml, zoom-session-check.yml y\n` +
        `   zoom-drift-check.yml, y subir MAX_WORKFLOW_SECRETS en este archivo.\n`,
    );
  }

  parts.forEach((part, i) => {
    const name = `${SECRET_PREFIX}${i + 1}`;
    console.log(`Subiendo ${name}...`);
    execFileSync("gh", ["secret", "set", name], { input: part, stdio: ["pipe", "inherit", "inherit"] });
  });

  // Sin esto, si la sesión nueva pesa menos que la anterior, los pedazos
  // viejos (N > parts.length) siguen en GitHub y los workflows los pegan al
  // final → base64 corrupto → "sesión vencida" aunque la captura sea buena
  // (pasó el 2026-09-19: 13 pedazos → 4).
  const existing = execFileSync("gh", ["secret", "list", "--json", "name", "-q", ".[].name"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((name) => name.startsWith(SECRET_PREFIX));
  for (const name of existing) {
    const n = Number(name.slice(SECRET_PREFIX.length));
    if (Number.isInteger(n) && n > parts.length) {
      console.log(`Borrando ${name} (sobrante de una sesión anterior)...`);
      execFileSync("gh", ["secret", "delete", name], { stdio: "inherit" });
    }
  }

  console.log("\nListo — los secrets de GitHub quedaron actualizados.");
}

main();
