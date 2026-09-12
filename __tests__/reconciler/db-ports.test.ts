import { describe, it, expect } from "vitest";
import { makeDryRunPorts } from "@/supabase/functions/_shared/reconciler/db-ports";
import type { ReconcilePorts } from "@/supabase/functions/_shared/reconciler/reconcile";
import type { Schedule } from "@/supabase/functions/_shared/reconciler/types";

const SCHEDULE: Schedule = {
  id: "s1",
  kind: "midweek",
  weekday: 4,
  localTime: "19:00:00",
  timezone: "America/Argentina/San_Juan",
  durationMinutes: 90,
  active: true,
};

function makeRealPorts(): ReconcilePorts {
  return {
    async getSchedule() {
      return SCHEDULE;
    },
    async findException() {
      return null;
    },
    async getWolCached() {
      return { midweek: { title: "T", url: "https://wol.jw.org/x" }, weekend: null };
    },
    async cancelOccurrence() {
      throw new Error("no debería llamarse nunca en dry-run");
    },
    async markBlocked() {
      throw new Error("no debería llamarse nunca en dry-run");
    },
    async upsertOccurrence() {
      throw new Error("no debería llamarse nunca en dry-run");
    },
  };
}

describe("makeDryRunPorts", () => {
  it("deja las lecturas intactas (reflejan el estado real)", async () => {
    const { ports } = makeDryRunPorts(makeRealPorts());
    expect(await ports.getSchedule("s1")).toEqual(SCHEDULE);
    expect(await ports.findException(new Date(), "midweek")).toBeNull();
    const wol = await ports.getWolCached("2026/38");
    expect(wol?.midweek?.title).toBe("T");
  });

  it("graba las escrituras en vez de aplicarlas, y nunca llama a los puertos reales", async () => {
    const { ports, recorded } = makeDryRunPorts(makeRealPorts());
    const date = new Date("2026-09-17T22:00:00.000Z");

    await expect(
      ports.upsertOccurrence("s1", date, { topic: "T", agenda: "A" }),
    ).resolves.toBeUndefined();
    await expect(ports.cancelOccurrence("s1", date, "asamblea")).resolves.toBeUndefined();
    await expect(ports.markBlocked("s1", date, "wol_section_missing")).resolves.toBeUndefined();

    expect(recorded).toEqual([
      { action: "upsert", scheduleId: "s1", date: date.toISOString(), detail: { topic: "T", agenda: "A" } },
      { action: "cancel", scheduleId: "s1", date: date.toISOString(), detail: "asamblea" },
      { action: "block", scheduleId: "s1", date: date.toISOString(), detail: "wol_section_missing" },
    ]);
  });
});
