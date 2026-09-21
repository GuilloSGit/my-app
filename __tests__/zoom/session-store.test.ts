import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { SESSION_FILE } from "@/zoom-automation/lib/zoom-browser";
import { pullSession, pushSession } from "@/zoom-automation/lib/session-store";

function fakeSupabase(result: { data: unknown; error: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue({ error: result.error });
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }), upsert });
  return { client: { from } as never, upsert, from };
}

// SESSION_FILE es la sesión real capturada en local: se preserva.
const originalSession = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE) : null;

describe("session-store", () => {
  beforeEach(() => rmSync(SESSION_FILE, { force: true }));
  afterAll(() => {
    if (originalSession) writeFileSync(SESSION_FILE, originalSession);
  });

  it("pullSession escribe la sesión de la base en SESSION_FILE", async () => {
    const state = { cookies: [{ name: "a" }], origins: [] };
    const { client } = fakeSupabase({ data: { state, updated_at: "2026-09-21T00:00:00Z" }, error: null });

    expect(await pullSession(client)).toBe(true);
    expect(JSON.parse(readFileSync(SESSION_FILE, "utf8"))).toEqual(state);
  });

  it("pullSession con la tabla vacía no toca el archivo (semilla)", async () => {
    const { client } = fakeSupabase({ data: null, error: null });

    expect(await pullSession(client)).toBe(false);
    expect(existsSync(SESSION_FILE)).toBe(false);
  });

  it("pullSession propaga el error de lectura", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(pullSession(client)).rejects.toThrow("zoom_session_state: boom");
  });

  it("pushSession hace upsert de la fila única id=1", async () => {
    const { client, upsert } = fakeSupabase({ data: null, error: null });
    await pushSession(client, { cookies: [], origins: [] }, "test");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 1, source: "test", state: { cookies: [], origins: [] } }));
  });
});
