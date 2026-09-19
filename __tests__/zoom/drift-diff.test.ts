import { describe, it, expect } from "vitest";
import { newIssues } from "@/zoom-automation/lib/drift-diff";

const a = { type: "orphan_in_zoom", zoomMeetingId: 1, detail: "sin ocurrencia" };
const b = { type: "missing_in_zoom", zoomMeetingId: 2, detail: "ya no existe" };

describe("newIssues", () => {
  it("sin corrida anterior, todo es nuevo", () => {
    expect(newIssues(null, [a, b])).toEqual([a, b]);
  });

  it("una divergencia que ya estaba en la corrida anterior no vuelve a avisar", () => {
    expect(newIssues([a], [a, b])).toEqual([b]);
  });

  it("si nada cambió, no hay nada nuevo", () => {
    expect(newIssues([a, b], [a, b])).toEqual([]);
  });

  it("un mismatch cuyo detalle cambió cuenta como nuevo", () => {
    const before = { type: "mismatch", zoomMeetingId: 3, detail: "duración esperada 120min, real 90min" };
    const after = { type: "mismatch", zoomMeetingId: 3, detail: "duración esperada 120min, real 60min" };
    expect(newIssues([before], [after])).toEqual([after]);
  });

  it("una divergencia que se arregló y reaparece vuelve a avisar", () => {
    expect(newIssues([], [a])).toEqual([a]);
  });
});
