import { describe, it, expect } from "vitest";
import { diffOccurrences } from "@/supabase/functions/_shared/reconciler/diff";
import type { DesiredOccurrence, Occurrence } from "@/supabase/functions/_shared/reconciler/types";

function desired(iso: string, topic = "T", agenda: string | null = null): DesiredOccurrence {
  return { startsAt: new Date(iso), durationMinutes: 90, topic, agenda };
}

function actual(
  id: string,
  iso: string,
  overrides: Partial<Occurrence> = {},
): Occurrence {
  return {
    id,
    scheduleId: "s1",
    startsAt: new Date(iso),
    durationMinutes: 90,
    topic: "T",
    agenda: null,
    wolWeek: null,
    zoomMeetingId: 111,
    joinUrl: "https://zoom.us/j/111",
    passcode: "abc",
    status: "synced",
    blockedReason: null,
    origin: "schedule",
    pinned: false,
    ...overrides,
  };
}

describe("diffOccurrences", () => {
  it("no genera ops si desired y actual coinciden exactamente", () => {
    const d = [desired("2026-09-17T22:00:00.000Z")];
    const a = [actual("a1", "2026-09-17T22:00:00.000Z")];
    expect(diffOccurrences(d, a)).toEqual([]);
  });

  it("un cambio de horario produce updates que preservan el zoomMeetingId (no cancel+create)", () => {
    // el mismo schedule se mueve de jueves 19:00 a domingo 20:00 -> mismo
    // orden cronológico, updates puros, ningún link nuevo
    const d = [
      desired("2026-09-20T23:00:00.000Z", "Reunión - Domingo 20/09"),
      desired("2026-09-27T23:00:00.000Z", "Reunión - Domingo 27/09"),
    ];
    const a = [
      actual("a1", "2026-09-17T22:00:00.000Z", { topic: "Reunión - Jueves 17/09" }),
      actual("a2", "2026-09-24T22:00:00.000Z", { topic: "Reunión - Jueves 24/09" }),
    ];
    const ops = diffOccurrences(d, a);
    expect(ops).toEqual([
      { kind: "update", id: "a1", zoomMeetingId: 111, to: d[0] },
      { kind: "update", id: "a2", zoomMeetingId: 111, to: d[1] },
    ]);
  });

  it("desired.length > actual.length: el excedente son creates", () => {
    const d = [desired("2026-09-17T22:00:00.000Z"), desired("2026-09-24T22:00:00.000Z")];
    const a = [actual("a1", "2026-09-17T22:00:00.000Z")];
    const ops = diffOccurrences(d, a);
    expect(ops).toEqual([{ kind: "create", to: d[1] }]);
  });

  it("desired.length < actual.length: el excedente son cancels", () => {
    const d = [desired("2026-09-17T22:00:00.000Z")];
    const a = [
      actual("a1", "2026-09-17T22:00:00.000Z"),
      actual("a2", "2026-09-24T22:00:00.000Z", { zoomMeetingId: 222 }),
    ];
    const ops = diffOccurrences(d, a);
    expect(ops).toEqual([{ kind: "cancel", id: "a2", zoomMeetingId: 222 }]);
  });

  it("las ocurrencias pinned/cancelled quedan afuera del matching porque el llamador las filtra antes", () => {
    const all: Occurrence[] = [
      actual("a1", "2026-09-17T22:00:00.000Z"),
      actual("a2", "2026-09-24T22:00:00.000Z", { pinned: true, startsAt: new Date("2026-10-01T22:00:00.000Z") }),
      actual("a3", "2026-10-08T22:00:00.000Z"),
    ];
    const filtered = all.filter((o) => !o.pinned && o.status !== "cancelled");
    expect(filtered.map((o) => o.id)).toEqual(["a1", "a3"]);

    const d = [desired("2026-09-20T23:00:00.000Z"), desired("2026-10-11T23:00:00.000Z")];
    const ops = diffOccurrences(d, filtered);
    // ambas son updates puros sobre a1/a3 — a2 (pinned) nunca aparece en ninguna op
    expect(ops.map((o) => (o.kind === "update" ? o.id : o.kind))).toEqual(["a1", "a3"]);
  });
});
