import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock (mismo patrón que __tests__/lib/meetings.test.ts) ─────────

type QueryResult = { data?: any; error?: any };

function makeChain(result: QueryResult) {
  const chain: Record<string, any> = {};
  const methods = ["select", "eq", "gte", "lte", "order", "limit"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.maybeSingle = () => Promise.resolve(result);
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
  buildOccurrenceShareMessage,
  Occurrence,
  triggerZoomSessionCheck,
  getLatestZoomSessionCheck,
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
    zoom_meeting_id: 111,
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
    expect(occurrence.zoomMeetingId).toBe(111);
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

describe("buildOccurrenceShareMessage", () => {
  const base: Occurrence = {
    id: "1",
    scheduleId: "s1",
    scheduleKind: "midweek",
    startsAt: "2026-09-17T22:00:00.000Z",
    durationMinutes: 120,
    topic: "Reunión de entresemana - Jueves 17/09",
    agenda: null,
    zoomMeetingId: 123,
    joinUrl: "https://zoom.us/j/123",
    passcode: "abc123",
    status: "synced",
    blockedReason: null,
    origin: "schedule",
    pinned: false,
  };

  it("incluye título corto según scheduleKind (no occurrence.topic), fecha, link y contraseña", () => {
    const msg = buildOccurrenceShareMessage(base);
    expect(msg).toContain("> *Reunión de entresemana*");
    expect(msg).not.toContain("Jueves 17/09");
    expect(msg).toContain("Link: https://zoom.us/j/123");
    expect(msg).toContain("Contraseña: abc123");
  });

  it("weekend usa 'Reunión de fin de semana' como título corto", () => {
    const msg = buildOccurrenceShareMessage({ ...base, scheduleKind: "weekend" });
    expect(msg).toContain("> *Reunión de fin de semana*");
  });

  it("suma los temas de la agenda bajo 'Temas de esta reunión', sin la URL de wol.jw.org", () => {
    const msg = buildOccurrenceShareMessage({
      ...base,
      agenda: "Tesoros de la Biblia\nhttps://wol.jw.org/es/wol/x\n\nLectura de la Biblia: Proverbios 1:1-7",
    });
    expect(msg).toContain("Temas de esta reunión:\nTesoros de la Biblia\n\nLectura de la Biblia: Proverbios 1:1-7");
    expect(msg).not.toContain("https://wol.jw.org");
  });

  it("omite agenda/link/contraseña cuando son null", () => {
    const msg = buildOccurrenceShareMessage({ ...base, agenda: null, joinUrl: null, passcode: null });
    expect(msg).not.toContain("Link:");
    expect(msg).not.toContain("Contraseña:");
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

describe("triggerZoomSessionCheck", () => {
  it("invoca zoom-session-check-dispatch y devuelve ok:true sin error", async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await triggerZoomSessionCheck();

    expect(result).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith("zoom-session-check-dispatch", { method: "POST" });
  });

  it("devuelve ok:false con el mensaje de error si la invocación falla", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: "forbidden" } });

    const result = await triggerZoomSessionCheck();

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("getLatestZoomSessionCheck", () => {
  it("mapea la fila más reciente de zoom_session_checks", async () => {
    mockFrom.mockReturnValue(
      makeChain({ data: { checked_at: "2026-09-17T20:00:00Z", ok: true, message: "Sesión activa" } }),
    );

    const check = await getLatestZoomSessionCheck();

    expect(mockFrom).toHaveBeenCalledWith("zoom_session_checks");
    expect(check).toEqual({
      checkedAt: "2026-09-17T20:00:00Z",
      ok: true,
      message: "Sesión activa",
      meetingsSeen: null,
      accountLabel: null,
      runUrl: null,
      source: null,
    });
  });

  it("mapea la constancia (reuniones vistas, cuenta, link a la corrida) de los chequeos nuevos", async () => {
    mockFrom.mockReturnValue(
      makeChain({
        data: {
          checked_at: "2026-09-19T11:00:00Z",
          ok: true,
          message: "Sesión activa",
          meetings_seen: 9,
          account_label: "cuenta@example.com",
          run_url: "https://github.com/x/y/actions/runs/1",
          source: "schedule",
        },
      }),
    );

    const check = await getLatestZoomSessionCheck();

    expect(check).toMatchObject({
      meetingsSeen: 9,
      accountLabel: "cuenta@example.com",
      runUrl: "https://github.com/x/y/actions/runs/1",
      source: "schedule",
    });
  });

  it("devuelve null si todavía no hay ningún chequeo", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));

    expect(await getLatestZoomSessionCheck()).toBeNull();
  });

  it("propaga el error de Supabase", async () => {
    mockFrom.mockReturnValue(makeChain({ error: { message: "boom" } }));
    await expect(getLatestZoomSessionCheck()).rejects.toThrow("boom");
  });
});
