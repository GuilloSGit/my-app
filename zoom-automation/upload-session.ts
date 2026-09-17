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
const CURRENT_SECRET_COUNT = 13; // ver ZOOM_AUTOMATION.md — si cambia, avisa abajo

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

  if (parts.length !== CURRENT_SECRET_COUNT) {
    console.warn(
      `\n⚠️  La cantidad de pedazos (${parts.length}) no coincide con la esperada (${CURRENT_SECRET_COUNT}).\n` +
        `   Hay que actualizar a mano .github/workflows/zoom-apply-browser.yml y\n` +
        `   .github/workflows/zoom-session-check.yml (la lista de\n` +
        `   ZOOM_SESSION_STATE_B64_N que concatenan) antes de confiar en este resultado,\n` +
        `   y este archivo (CURRENT_SECRET_COUNT) para que el próximo aviso sea correcto.\n`,
    );
  }

  parts.forEach((part, i) => {
    const name = `ZOOM_SESSION_STATE_B64_${i + 1}`;
    console.log(`Subiendo ${name}...`);
    execFileSync("gh", ["secret", "set", name], { input: part, stdio: ["pipe", "inherit", "inherit"] });
  });

  console.log("\nListo — los secrets de GitHub quedaron actualizados.");
}

main();
