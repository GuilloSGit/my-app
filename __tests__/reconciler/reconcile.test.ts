import { describe, it, expect } from "vitest";
import { reconcileWeek, reconcileMonth, type ReconcilePorts } from "@/supabase/functions/_shared/reconciler/reconcile";
import type { Issue, Schedule, ScheduleException, WolWeekResult } from "@/supabase/functions/_shared/reconciler/types";

const SCHEDULE: Schedule = {
  id: "s1",
  kind: "midweek",
  weekday: 4, // jueves
  localTime: "19:00:00",
  timezone: "America/Argentina/San_Juan",
  durationMinutes: 90,
  active: true,
};

type FakeState = {
  occurrences: Map<string, { topic: string; agenda: string | null }>;
  cancelled: Map<string, string>;
  blocked: Map<string, string>;
};

function keyFor(scheduleId: string, date: Date): string {
  return `${scheduleId}|${date.toISOString()}`;
}

function makeFakePorts(opts: {
  wolByWeek?: Record<string, WolWeekResult | null>;
  exceptionByDate?: Record<string, ScheduleException>;
  wolThrowsForWeek?: string;
} = {}): { ports: ReconcilePorts; state: FakeState; calls: { getWolCached: string[] } } {
  const state: FakeState = { occurrences: new Map(), cancelled: new Map(), blocked: new Map() };
  const calls = { getWolCached: [] as string[] };

  const ports: ReconcilePorts = {
    async getSchedule() {
      return SCHEDULE;
    },
    async findException(date) {
      const key = date.toISOString().slice(0, 10);
      return opts.exceptionByDate?.[key] ?? null;
    },
    async getWolCached(week) {
      calls.getWolCached.push(week);
      if (opts.wolThrowsForWeek === week) throw new Error("boom");
      return opts.wolByWeek?.[week] ?? null;
    },
    async cancelOccurrence(scheduleId, date, reason) {
      state.cancelled.set(keyFor(scheduleId, date), reason);
      state.occurrences.delete(keyFor(scheduleId, date));
    },
    async markBlocked(scheduleId, date, reason) {
      state.blocked.set(keyFor(scheduleId, date), reason);
    },
    async upsertOccurrence(scheduleId, date, fields) {
      state.occurrences.set(keyFor(scheduleId, date), fields);
    },
  };

  return { ports, state, calls };
}

const NOW = new Date("2026-09-01T00:00:00.000Z"); // bien antes de la semana 2026/38 (jueves 17/09)

const OK_WOL: WolWeekResult = {
  midweek: { title: "Aprendamos de los gabaonitas", url: "https://wol.jw.org/es/wol/d/r4/lp-s/2026482" },
  weekend: { title: "Otro artículo", url: "https://wol.jw.org/es/wol/d/r4/lp-s/2026999" },
};

describe("reconcileWeek", () => {
  it("camino feliz: WOL con contenido -> upsertOccurrence con topic + agenda, sin issues bloqueantes", async () => {
    const { ports, state } = makeFakePorts({ wolByWeek: { "2026/38": OK_WOL } });
    const issues: Issue[] = [];
    await reconcileWeek("s1", "2026/38", issues, ports, NOW);

    expect(issues).toEqual([]);
    const [[, fields]] = Array.from(state.occurrences.entries());
    expect(fields.topic).toBe("Reunión de entresemana - Jueves 17/09");
    expect(fields.agenda).toBe(
      "Aprendamos de los gabaonitas\nhttps://wol.jw.org/es/wol/d/r4/lp-s/2026482",
    );
  });

  it("WOL inalcanzable (null) -> warning transitorio, no toca nada", async () => {
    const { ports, state } = makeFakePorts({ wolByWeek: { "2026/38": null } });
    const issues: Issue[] = [];
    await reconcileWeek("s1", "2026/38", issues, ports, NOW);

    expect(issues).toEqual([
      expect.objectContaining({ severity: "warning", code: "wol_unreachable" }),
    ]);
    expect(state.occurrences.size).toBe(0);
    expect(state.blocked.size).toBe(0);
  });

  it("WOL cargó pero falta la sección de este kind -> blocked, requiere revisión", async () => {
    const { ports, state } = makeFakePorts({
      wolByWeek: { "2026/38": { midweek: null, weekend: OK_WOL.weekend } },
    });
    const issues: Issue[] = [];
    await reconcileWeek("s1", "2026/38", issues, ports, NOW);

    expect(issues).toEqual([
      expect.objectContaining({ severity: "blocked", code: "wol_section_missing" }),
    ]);
    expect(state.blocked.size).toBe(1);
    expect(state.occurrences.size).toBe(0);
  });

  it("wol_unreachable y wol_section_missing son caminos separados, nunca el mismo catch", async () => {
    // si estuvieran colapsados, ambos casos aterrizarían con el mismo code
    const unreachable = makeFakePorts({ wolByWeek: { "2026/38": null } });
    const missing = makeFakePorts({ wolByWeek: { "2026/38": { midweek: null, weekend: null } } });
    const issuesA: Issue[] = [];
    const issuesB: Issue[] = [];
    await reconcileWeek("s1", "2026/38", issuesA, unreachable.ports, NOW);
    await reconcileWeek("s1", "2026/38", issuesB, missing.ports, NOW);
    expect(issuesA[0].code).not.toBe(issuesB[0].code);
  });

  it("excepción explícita -> cancela y no consulta WOL", async () => {
    const { ports, state, calls } = makeFakePorts({
      exceptionByDate: {
        "2026-09-17": {
          id: "e1",
          kind: "assembly",
          label: "Asamblea de circuito",
          venue: "Salón X",
          eventDays: ["2026-09-17"],
          suppresses: ["midweek", "weekend"],
          createsZoom: false,
          note: null,
        },
      },
      wolByWeek: { "2026/38": OK_WOL },
    });
    const issues: Issue[] = [];
    await reconcileWeek("s1", "2026/38", issues, ports, NOW);

    expect(issues).toEqual([
      expect.objectContaining({ severity: "info", code: "suppressed", message: "Asamblea de circuito — Salón X" }),
    ]);
    expect(state.cancelled.size).toBe(1);
    expect(calls.getWolCached).toEqual([]); // no hace falta ni consultar WOL
  });

  it("el día de reunión de esta semana ya pasó -> no hace nada, ni siquiera consulta WOL", async () => {
    // semana 2026/38: jueves 17/09. "now" cae el sábado siguiente, después
    // de que la reunión de esa semana ya pasó -- pasa seguido con un cron
    // cada 2 días, no es solo un caso de la primera corrida.
    const { ports, state, calls } = makeFakePorts({ wolByWeek: { "2026/38": OK_WOL } });
    const issues: Issue[] = [];
    const pastNow = new Date("2026-09-19T12:00:00.000Z");
    await reconcileWeek("s1", "2026/38", issues, ports, pastNow);

    expect(issues).toEqual([]);
    expect(state.occurrences.size).toBe(0);
    expect(calls.getWolCached).toEqual([]);
  });
});

describe("reconcileMonth", () => {
  it("una semana que tira error no frena a las demás — el mes termina de correr", async () => {
    const { ports, state } = makeFakePorts({
      wolByWeek: { "2026/38": OK_WOL, "2026/39": OK_WOL, "2026/40": OK_WOL, "2026/41": OK_WOL },
      wolThrowsForWeek: "2026/39",
    });
    const now = new Date("2026-09-14T12:00:00.000Z"); // dentro de la semana 38
    const issues = await reconcileMonth("s1", ports, { now });

    const failed = issues.find((i) => i.code === "week_failed");
    expect(failed).toBeDefined();
    expect(failed?.week).toBe("2026/39");
    // las otras semanas del horizonte sí se procesaron
    expect(state.occurrences.size).toBeGreaterThanOrEqual(3);
  });

  it("la semana que contiene `now` ya pasó -> se salta esa semana sola, el resto del mes se procesa igual", async () => {
    // reproduce el bug real encontrado 2026-09-13: con "now" cayendo
    // después del jueves de la semana 37 (10/09), esa semana no tiene que
    // generar una ocurrencia -- Zoom no permite agendar en el pasado.
    const { ports, state } = makeFakePorts({
      wolByWeek: {
        "2026/37": OK_WOL,
        "2026/38": OK_WOL,
        "2026/39": OK_WOL,
        "2026/40": OK_WOL,
        "2026/41": OK_WOL,
        "2026/42": OK_WOL,
      },
    });
    const now = new Date("2026-09-13T12:00:00.000Z"); // domingo, fin de la semana 37
    const issues = await reconcileMonth("s1", ports, { now });

    const dates = Array.from(state.occurrences.keys());
    expect(dates.some((k) => k.includes("2026-09-10"))).toBe(false); // semana 37, ya pasada
    expect(dates.some((k) => k.includes("2026-09-17"))).toBe(true); // semana 38, sí se procesa
    expect(issues).toEqual([]); // saltear una semana pasada no es un problema, no genera issue
  });

  it("idempotencia: correr reconcileMonth dos veces seguidas no duplica ni cambia el resultado", async () => {
    const { ports, state: state1 } = makeFakePorts({
      wolByWeek: { "2026/38": OK_WOL, "2026/39": OK_WOL, "2026/40": OK_WOL, "2026/41": OK_WOL },
    });
    const now = new Date("2026-09-14T12:00:00.000Z");

    const issues1 = await reconcileMonth("s1", ports, { now });
    const snapshot1 = new Map(state1.occurrences);

    const issues2 = await reconcileMonth("s1", ports, { now });
    const snapshot2 = new Map(state1.occurrences);

    expect(snapshot2.size).toBe(snapshot1.size);
    expect(Array.from(snapshot2.entries())).toEqual(Array.from(snapshot1.entries()));
    expect(issues2.filter((i) => i.severity !== "info")).toEqual(
      issues1.filter((i) => i.severity !== "info"),
    );
  });
});
