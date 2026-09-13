import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock (mismo patrón que __tests__/lib/meetings.test.ts) ─────────

type QueryResult = { data?: any; error?: any };

function makeChain(result: QueryResult) {
  const chain: Record<string, any> = {};
  const methods = ["select", "eq", "gte", "lte", "order", "limit"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve: (v: QueryResult) => any) => Promise.resolve(result).then(resolve);
  return chain;
}

const { mockFrom, mockInvoke } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockInvoke: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: mockFrom, functions: { invoke: mockInvoke } } }));

import {
  getActiveSchedules,
  getUpcomingOccurrences,
  getLatestReconcileRuns,
  triggerZoomSync,
  scheduleKindLabel,
  occurrenceStatusLabel,
} from "@/lib/automation";

beforeEach(() => {
  mockFrom.mockReset();
  mockInvoke.mockReset();
});

describe("getActiveSchedules", () => {
  it("mapea las filas de meeting_schedules a Schedule", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: [
          {
            id: "s1",
            kind: "midweek",
            weekday: 4,
            local_time: "19:00:00",
            timezone: "America/Argentina/San_Juan",
            duration_minutes: 90,
            active: true,
          },
        ],
      }),
    );

    const schedules = await getActiveSchedules();

    expect(mockFrom).toHaveBeenCalledWith("meeting_schedules");
    expect(schedules).toEqual([
      {
        id: "s1",
        kind: "midweek",
        weekday: 4,
        localTime: "19:00:00",
        timezone: "America/Argentina/San_Juan",
        durationMinutes: 90,
        active: true,
      },
    ]);
  });

  it("propaga el error de Supabase", async () => {
    mockFrom.mockReturnValue(makeChain({ error: { message: "boom" } }));
    await expect(getActiveSchedules()).rejects.toThrow("boom");
  });
});

describe("getUpcomingOccurrences", () => {
  const baseRow = {
    id: "o1",
    schedule_id: "s1",
    starts_at: "2026-09-17T22:00:00.000Z",
    duration_minutes: 90,
    topic: "Reunión de entresemana - Jueves 17/09",
    agenda: "Vida y Ministerio\nhttps://wol.jw.org/x",
    join_url: "https://jworg.zoom.us/j/111",
    passcode: "123456",
    status: "synced" as const,
    blocked_reason: null,
    origin: "schedule" as const,
    pinned: false,
  };

  it("mapea el embed de meeting_schedules cuando viene como objeto", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: [{ ...baseRow, meeting_schedules: { kind: "midweek" } }] }),
    );

    const [occurrence] = await getUpcomingOccurrences();

    expect(occurrence.scheduleKind).toBe("midweek");
    expect(occurrence.joinUrl).toBe("https://jworg.zoom.us/j/111");
    expect(occurrence.status).toBe("synced");
  });

  it("mapea el embed de meeting_schedules cuando viene como array", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: [{ ...baseRow, meeting_schedules: [{ kind: "weekend" }] }] }),
    );

    const [occurrence] = await getUpcomingOccurrences();

    expect(occurrence.scheduleKind).toBe("weekend");
  });

  it("borde: sin embed, no explota (default a midweek)", async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ ...baseRow, meeting_schedules: null }] }));

    const [occurrence] = await getUpcomingOccurrences();

    expect(occurrence.scheduleKind).toBe("midweek");
  });
});

describe("getLatestReconcileRuns", () => {
  it("se queda con la corrida más reciente por schedule_id", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: [
          { schedule_id: "s1", started_at: "2026-09-12T10:00:00Z", finished_at: "2026-09-12T10:01:00Z", issues: [1, 2] },
          { schedule_id: "s2", started_at: "2026-09-11T10:00:00Z", finished_at: "2026-09-11T10:01:00Z", issues: [] },
          // Fila más vieja de s1, ya cubierta por la primera — debe ignorarse.
          { schedule_id: "s1", started_at: "2026-09-10T10:00:00Z", finished_at: "2026-09-10T10:01:00Z", issues: [] },
        ],
      }),
    );

    const runs = await getLatestReconcileRuns();

    expect(runs).toEqual([
      { scheduleId: "s1", startedAt: "2026-09-12T10:00:00Z", finishedAt: "2026-09-12T10:01:00Z", issuesCount: 2 },
      { scheduleId: "s2", startedAt: "2026-09-11T10:00:00Z", finishedAt: "2026-09-11T10:01:00Z", issuesCount: 0 },
    ]);
  });

  it("borde: filas sin schedule_id se ignoran", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: [{ schedule_id: null, started_at: "2026-09-12T10:00:00Z", finished_at: null, issues: null }] }),
    );

    expect(await getLatestReconcileRuns()).toEqual([]);
  });
});

describe("labels", () => {
  it("scheduleKindLabel traduce los dos kinds", () => {
    expect(scheduleKindLabel("midweek")).toBe("Entresemana");
    expect(scheduleKindLabel("weekend")).toBe("Fin de semana");
  });

  it("occurrenceStatusLabel traduce los cuatro estados", () => {
    expect(occurrenceStatusLabel("pending")).toBe("Pendiente");
    expect(occurrenceStatusLabel("synced")).toBe("Sincronizada");
    expect(occurrenceStatusLabel("cancelled")).toBe("Cancelada");
    expect(occurrenceStatusLabel("blocked")).toBe("Bloqueada");
  });
});

describe("triggerZoomSync", () => {
  it("invoca zoom-apply-dispatch y devuelve ok:true sin error", async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await triggerZoomSync();

    expect(result).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith("zoom-apply-dispatch", { method: "POST" });
  });

  it("devuelve ok:false con el mensaje de error si la invocación falla", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: "forbidden" } });

    const result = await triggerZoomSync();

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});
