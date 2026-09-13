import { describe, it, expect } from "vitest";
import { computeScheduleWriteOps } from "@/supabase/functions/_shared/reconciler/schedule-write";
import type { Occurrence, Schedule } from "@/supabase/functions/_shared/reconciler/types";

const TZ = "America/Argentina/San_Juan";
const NOW = new Date("2026-09-01T00:00:00.000Z");

const THURSDAY_19: Schedule = {
  id: "s1",
  kind: "midweek",
  weekday: 4,
  localTime: "19:00:00",
  durationMinutes: 90,
  timezone: TZ,
  active: true,
};

function occ(id: string, iso: string, topic: string, overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id,
    scheduleId: "s1",
    startsAt: new Date(iso),
    durationMinutes: 90,
    topic,
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

// jueves 03/09, 10/09, 17/09, 24/09/2026 a las 19:00 San_Juan == 22:00 UTC
const T1 = occ("a1", "2026-09-03T22:00:00.000Z", "Reunión de entresemana - Jueves 03/09");
const T2 = occ("a2", "2026-09-10T22:00:00.000Z", "Reunión de entresemana - Jueves 10/09");
const T3 = occ("a3", "2026-09-17T22:00:00.000Z", "Reunión de entresemana - Jueves 17/09");
const T4 = occ("a4", "2026-09-24T22:00:00.000Z", "Reunión de entresemana - Jueves 24/09");

describe("computeScheduleWriteOps", () => {
  it("sin cambios en el horario -> ops vacío (guardar sin editar no dispara nada)", () => {
    const ops = computeScheduleWriteOps(THURSDAY_19, [T1, T2, T3, T4], NOW);
    expect(ops).toEqual([]);
  });

  it("cambio de hora pura (mismo día) -> solo updates, sin previousTopic (el topic no depende de la hora)", () => {
    const schedule: Schedule = { ...THURSDAY_19, localTime: "20:00:00" };
    const ops = computeScheduleWriteOps(schedule, [T1, T2, T3, T4], NOW);

    expect(ops).toHaveLength(4);
    for (const op of ops) {
      expect(op.kind).toBe("update");
      expect(op.previousTopic).toBeUndefined();
      expect(op.previousStartsAt).toBeDefined();
    }
    expect(ops[0]).toMatchObject({
      occurrenceId: "a1",
      zoomMeetingId: 111,
      startsAt: "2026-09-03T23:00:00.000Z", // 20:00 San_Juan
      previousStartsAt: "2026-09-03T22:00:00.000Z",
    });
  });

  it("cambio de día (jueves -> sábado) -> updates con previousTopic y previousStartsAt", () => {
    const schedule: Schedule = { ...THURSDAY_19, kind: "weekend", weekday: 6, localTime: "18:00:00" };
    const ops = computeScheduleWriteOps(schedule, [T1, T2, T3, T4], NOW);

    expect(ops).toHaveLength(4);
    expect(ops[0]).toMatchObject({
      kind: "update",
      occurrenceId: "a1",
      previousTopic: "Reunión de entresemana - Jueves 03/09",
      topic: "Reunión de fin de semana - Sábado 05/09",
    });
  });

  it("actual más corto que lo deseado -> el excedente son creates, sin tocar lo que ya coincide", () => {
    const ops = computeScheduleWriteOps(THURSDAY_19, [T1, T2, T3], NOW);
    expect(ops).toEqual([{ kind: "create", topic: T4.topic, startsAt: T4.startsAt.toISOString() }]);
  });

  it("actual más largo que lo deseado -> el excedente son cancels, sin tocar lo que ya coincide", () => {
    const extra = occ("a5", "2026-10-01T22:00:00.000Z", "Reunión de entresemana - Jueves 01/10");
    const ops = computeScheduleWriteOps(THURSDAY_19, [T1, T2, T3, T4, extra], NOW);
    expect(ops).toEqual([
      { kind: "cancel", occurrenceId: "a5", zoomMeetingId: 111, topic: extra.topic, startsAt: extra.startsAt.toISOString() },
    ]);
  });

});
