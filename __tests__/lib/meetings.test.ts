import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────────────────

type QueryResult = { data?: any; error?: any };

function makeChain(result: QueryResult) {
  const chain: Record<string, any> = {};
  const methods = ["select", "insert", "update", "delete", "eq", "gte", "lt", "order", "single"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  // Hacer el final de la cadena awaitable
  chain.then = (resolve: (v: QueryResult) => any) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mockFrom } }));

// ── Importar módulo bajo test ────────────────────────────────────────────────

import {
  formatMeetingDate,
  formatMeetingTime,
  validateMeeting,
  getUpcomingMeetings,
  getAllMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  cleanPastMeetings,
} from "@/lib/meetings";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

const mockRow = {
  id: "abc123",
  title: "Reunión General",
  date: futureDate,
  zoom_link: "https://zoom.us/j/123",
  zoom_id: "123456",
  passcode: "pass123",
};

// ── Tests de funciones puras ─────────────────────────────────────────────────

describe("formatMeetingDate", () => {
  it("formatea fecha en español argentino", () => {
    const result = formatMeetingDate("2026-04-12T19:00:00");
    expect(result).toMatch(/abril/i);
    expect(result).toMatch(/2026/);
  });

  it("incluye hora y minutos", () => {
    const result = formatMeetingDate("2026-04-12T19:30:00");
    expect(result).toMatch(/19|07/); // 19:00 o 7:00 PM
  });
});

describe("formatMeetingTime", () => {
  it("retorna solo la hora", () => {
    const result = formatMeetingTime("2026-04-12T19:00:00");
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("validateMeeting", () => {
  const valid = {
    date: "2026-04-12T19:00:00",
    title: "Test",
    zoomLink: "https://zoom.us/j/123",
    zoomId: "123456",
    passcode: "abc",
  };

  it("retorna null para datos válidos", () => {
    expect(validateMeeting(valid)).toBeNull();
  });

  it("requiere fecha", () => {
    expect(validateMeeting({ ...valid, date: "" })).toBeTruthy();
  });

  it("requiere título", () => {
    expect(validateMeeting({ ...valid, title: "  " })).toBeTruthy();
  });

  it("requiere zoom link", () => {
    expect(validateMeeting({ ...valid, zoomLink: "" })).toBeTruthy();
  });

  it("requiere zoom ID", () => {
    expect(validateMeeting({ ...valid, zoomId: "" })).toBeTruthy();
  });

  it("requiere passcode", () => {
    expect(validateMeeting({ ...valid, passcode: "" })).toBeTruthy();
  });

  it("rechaza fecha inválida", () => {
    expect(validateMeeting({ ...valid, date: "no-es-fecha" })).toBeTruthy();
  });
});

// ── Tests de funciones que usan Supabase ─────────────────────────────────────

describe("getUpcomingMeetings", () => {
  it("retorna reuniones futuras ordenadas por fecha", async () => {
    const chain = makeChain({ data: [mockRow], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getUpcomingMeetings();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Reunión General");
    expect(result[0].zoomLink).toBe("https://zoom.us/j/123");
    expect(mockFrom).toHaveBeenCalledWith("meetings");
    expect(chain.gte).toHaveBeenCalled();
    expect(chain.order).toHaveBeenCalledWith("date", { ascending: true });
  });

  it("lanza error cuando Supabase falla", async () => {
    const chain = makeChain({ data: null, error: { message: "DB error" } });
    mockFrom.mockReturnValue(chain);

    await expect(getUpcomingMeetings()).rejects.toThrow("DB error");
  });
});

describe("getAllMeetings", () => {
  it("retorna todas las reuniones", async () => {
    const rows = [mockRow, { ...mockRow, id: "def456", date: pastDate }];
    const chain = makeChain({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getAllMeetings();
    expect(result).toHaveLength(2);
  });
});

describe("getMeetingById", () => {
  it("retorna la reunión si existe", async () => {
    const chain = makeChain({ data: mockRow, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMeetingById("abc123");
    expect(result?.id).toBe("abc123");
    expect(chain.eq).toHaveBeenCalledWith("id", "abc123");
  });

  it("retorna undefined si no existe", async () => {
    const chain = makeChain({ data: null, error: { message: "Not found" } });
    mockFrom.mockReturnValue(chain);

    const result = await getMeetingById("nope");
    expect(result).toBeUndefined();
  });
});

describe("createMeeting", () => {
  it("inserta la reunión y retorna con id", async () => {
    const chain = makeChain({ data: mockRow, error: null });
    mockFrom.mockReturnValue(chain);

    const input = {
      title: "Nueva Reunión",
      date: futureDate,
      zoomLink: "https://zoom.us/j/999",
      zoomId: "999",
      passcode: "xyz",
    };

    const result = await createMeeting(input);
    expect(result.id).toBeDefined();
    expect(chain.insert).toHaveBeenCalled();
    // El row insertado usa snake_case
    const insertedRow = chain.insert.mock.calls[0][0];
    expect(insertedRow.zoom_link).toBe("https://zoom.us/j/999");
    expect(insertedRow.zoom_id).toBe("999");
  });

  it("lanza error si Supabase falla", async () => {
    const chain = makeChain({ data: null, error: { message: "Insert error" } });
    mockFrom.mockReturnValue(chain);

    await expect(createMeeting({
      title: "X", date: futureDate, zoomLink: "x", zoomId: "x", passcode: "x",
    })).rejects.toThrow("Insert error");
  });
});

describe("updateMeeting", () => {
  it("actualiza campos en snake_case", async () => {
    const updated = { ...mockRow, title: "Actualizado" };
    const chain = makeChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await updateMeeting("abc123", { title: "Actualizado", zoomLink: "https://zoom.us/j/new" });
    expect(result?.title).toBe("Actualizado");
    expect(chain.update).toHaveBeenCalled();
    const updatePayload = chain.update.mock.calls[0][0];
    expect(updatePayload.zoom_link).toBe("https://zoom.us/j/new");
  });

  it("retorna null si Supabase falla", async () => {
    const chain = makeChain({ data: null, error: { message: "Not found" } });
    mockFrom.mockReturnValue(chain);

    const result = await updateMeeting("nope", { title: "X" });
    expect(result).toBeNull();
  });
});

describe("deleteMeeting", () => {
  it("retorna true si la eliminación fue exitosa", async () => {
    const chain = makeChain({ error: null });
    mockFrom.mockReturnValue(chain);

    const result = await deleteMeeting("abc123");
    expect(result).toBe(true);
    expect(chain.eq).toHaveBeenCalledWith("id", "abc123");
  });

  it("retorna false si hay error", async () => {
    const chain = makeChain({ error: { message: "Delete error" } });
    mockFrom.mockReturnValue(chain);

    const result = await deleteMeeting("nope");
    expect(result).toBe(false);
  });
});

describe("cleanPastMeetings", () => {
  it("elimina reuniones pasadas y retorna la cantidad", async () => {
    const deletedRows = [{ id: "old1" }, { id: "old2" }];
    const chain = makeChain({ data: deletedRows, error: null });
    mockFrom.mockReturnValue(chain);

    const count = await cleanPastMeetings();
    expect(count).toBe(2);
    expect(chain.lt).toHaveBeenCalled();
  });

  it("retorna 0 si hay error", async () => {
    const chain = makeChain({ data: null, error: { message: "Error" } });
    mockFrom.mockReturnValue(chain);

    const count = await cleanPastMeetings();
    expect(count).toBe(0);
  });
});
