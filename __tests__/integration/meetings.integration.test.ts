/**
 * Test de integración: simula el flujo completo CRUD de reuniones
 * con un store en memoria que ejecuta las queries de manera diferida,
 * replicando el comportamiento lazy del query builder de Supabase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Store en memoria ─────────────────────────────────────────────────────────

type Row = {
  id: string;
  title: string;
  date: string;
  zoom_link: string;
  zoom_id: string;
  passcode: string;
};

let store: Row[] = [];

// Builder lazy: acumula operaciones y ejecuta cuando se awaita
function buildChain() {
  type Op = "select" | "insert" | "update" | "delete";
  let op: Op = "select";
  let insertData: Row | Row[] | null = null;
  let updateData: Partial<Row> | null = null;
  let eqConditions: Array<{ field: string; value: any }> = [];
  let gteField: string | null = null;
  let gteValue: string | null = null;
  let ltField: string | null = null;
  let ltValue: string | null = null;
  let orderField: string | null = null;
  let orderAsc = true;

  function execute(single: boolean): Promise<{ data: any; error: any }> {
    let result: Row[];

    if (op === "insert") {
      const rows = Array.isArray(insertData) ? insertData : [insertData!];
      rows.forEach((r) => store.push(r));
      result = rows;
    } else if (op === "update") {
      const cond = eqConditions.find((c) => c.field === "id");
      store = store.map((r) =>
        cond && r.id === cond.value ? { ...r, ...updateData } : r
      );
      result = cond ? store.filter((r) => r.id === cond.value) : [];
    } else if (op === "delete") {
      const cond = eqConditions.find((c) => c.field === "id");
      if (cond) {
        result = store.filter((r) => r.id === cond.value);
        store = store.filter((r) => r.id !== cond.value);
      } else if (ltField && ltValue) {
        result = store.filter((r) => (r as any)[ltField!] < ltValue!);
        store = store.filter((r) => (r as any)[ltField!] >= ltValue!);
      } else {
        result = [];
      }
    } else {
      // select
      result = [...store];
      if (gteField && gteValue) {
        result = result.filter((r) => (r as any)[gteField!] >= gteValue!);
      }
      eqConditions.forEach((c) => {
        result = result.filter((r) => (r as any)[c.field] === c.value);
      });
      if (orderField) {
        result = [...result].sort((a, b) => {
          const av = (a as any)[orderField!];
          const bv = (b as any)[orderField!];
          return orderAsc ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
        });
      }
    }

    const data = single ? (result[0] ?? null) : result;
    const error = single && result.length === 0 ? { message: "Not found" } : null;
    return Promise.resolve({ data, error });
  }

  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((data: Row | Row[]) => { op = "insert"; insertData = data; return chain; }),
    update: vi.fn((data: Partial<Row>) => { op = "update"; updateData = data; return chain; }),
    delete: vi.fn(() => { op = "delete"; return chain; }),
    eq: vi.fn((field: string, value: any) => { eqConditions.push({ field, value }); return chain; }),
    gte: vi.fn((field: string, value: string) => { gteField = field; gteValue = value; return chain; }),
    lt: vi.fn((field: string, value: string) => { ltField = field; ltValue = value; return chain; }),
    order: vi.fn((field: string, opts: { ascending: boolean }) => {
      orderField = field;
      orderAsc = opts?.ascending ?? true;
      return chain;
    }),
    single: vi.fn(() => execute(true)),
    then: (resolve: any) => execute(false).then(resolve),
  };

  return chain;
}

// ── Mock de Supabase ──────────────────────────────────────────────────────────

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mockFrom } }));

// ── Imports bajo test ────────────────────────────────────────────────────────

import {
  createMeeting,
  getUpcomingMeetings,
  getAllMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  cleanPastMeetings,
} from "@/lib/meetings";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  store = [];
  mockFrom.mockImplementation(() => buildChain());
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Flujo completo CRUD de reuniones", () => {
  const future1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString();
  const future2 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  it("crea una reunión y la puede recuperar por ID", async () => {
    const created = await createMeeting({
      title: "Reunión General",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111111",
      passcode: "pass1",
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Reunión General");

    const found = await getMeetingById(created.id);
    expect(found?.title).toBe("Reunión General");
    expect(found?.zoomLink).toBe("https://zoom.us/j/111");
  });

  it("getUpcomingMeetings filtra reuniones pasadas", async () => {
    await createMeeting({
      title: "Pasada",
      date: past,
      zoomLink: "https://zoom.us/j/000",
      zoomId: "000",
      passcode: "p",
    });
    await createMeeting({
      title: "Futura",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111",
      passcode: "p",
    });

    const upcoming = await getUpcomingMeetings();
    expect(upcoming.some((m) => m.title === "Futura")).toBe(true);
    expect(upcoming.some((m) => m.title === "Pasada")).toBe(false);
  });

  it("getUpcomingMeetings ordena de más próxima a más lejana", async () => {
    await createMeeting({
      title: "Segunda",
      date: future2,
      zoomLink: "https://zoom.us/j/222",
      zoomId: "222",
      passcode: "p",
    });
    await createMeeting({
      title: "Primera",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111",
      passcode: "p",
    });

    const upcoming = await getUpcomingMeetings();
    expect(upcoming[0].title).toBe("Primera");
    expect(upcoming[1].title).toBe("Segunda");
  });

  it("actualiza campos de una reunión existente sin tocar el resto", async () => {
    const created = await createMeeting({
      title: "Original",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111",
      passcode: "original",
    });

    const updated = await updateMeeting(created.id, {
      title: "Actualizada",
      passcode: "nuevo",
    });

    expect(updated?.title).toBe("Actualizada");
    expect(updated?.passcode).toBe("nuevo");
    expect(updated?.zoomLink).toBe("https://zoom.us/j/111"); // no cambió
  });

  it("elimina una reunión y no aparece en getAllMeetings", async () => {
    const created = await createMeeting({
      title: "A Eliminar",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111",
      passcode: "p",
    });

    const deleted = await deleteMeeting(created.id);
    expect(deleted).toBe(true);

    const all = await getAllMeetings();
    expect(all.some((m) => m.id === created.id)).toBe(false);
  });

  it("cleanPastMeetings elimina solo reuniones pasadas", async () => {
    await createMeeting({
      title: "Pasada",
      date: past,
      zoomLink: "https://zoom.us/j/000",
      zoomId: "000",
      passcode: "p",
    });
    await createMeeting({
      title: "Futura",
      date: future1,
      zoomLink: "https://zoom.us/j/111",
      zoomId: "111",
      passcode: "p",
    });

    const removed = await cleanPastMeetings();
    expect(removed).toBeGreaterThanOrEqual(1);

    const all = await getAllMeetings();
    expect(all.some((m) => m.title === "Pasada")).toBe(false);
    expect(all.some((m) => m.title === "Futura")).toBe(true);
  });

  it("updateMeeting retorna null para ID inexistente", async () => {
    const result = await updateMeeting("id-que-no-existe", { title: "X" });
    expect(result).toBeNull();
  });

  it("getMeetingById retorna undefined para ID inexistente", async () => {
    const result = await getMeetingById("no-existe");
    expect(result).toBeUndefined();
  });
});
