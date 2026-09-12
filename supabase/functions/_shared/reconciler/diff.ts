import type { DesiredOccurrence, Occurrence, ReconcileOp } from "./types.ts";

// El truco central del reconciliador: empareja por ORDEN CRONOLÓGICO
// (posición en el array, ya ordenado), no por starts_at. Si se emparejara
// por starts_at, cambiar la hora del schedule produciría N cancels + N
// creates (link nuevo para todos). Emparejando por posición, la primera
// ocurrencia existente se aparea con la primera deseada y sale un solo
// `update`, que en la capa de Zoom se traduce a un PATCH que preserva el
// join_url.
//
// `actual` debe venir ya filtrado (sin `cancelled` ni `pinned`) y ordenado
// cronológicamente — este módulo no filtra ni ordena, solo empareja.
export function diffOccurrences(desired: DesiredOccurrence[], actual: Occurrence[]): ReconcileOp[] {
  const ops: ReconcileOp[] = [];
  const n = Math.min(desired.length, actual.length);

  for (let i = 0; i < n; i++) {
    const d = desired[i];
    const a = actual[i];
    const changed =
      a.startsAt.getTime() !== d.startsAt.getTime() ||
      a.durationMinutes !== d.durationMinutes ||
      a.topic !== d.topic ||
      (a.agenda ?? null) !== (d.agenda ?? null);

    if (changed) {
      ops.push({ kind: "update", id: a.id, zoomMeetingId: a.zoomMeetingId, to: d });
    }
  }

  for (let i = n; i < desired.length; i++) {
    ops.push({ kind: "create", to: desired[i] });
  }

  for (let i = n; i < actual.length; i++) {
    ops.push({ kind: "cancel", id: actual[i].id, zoomMeetingId: actual[i].zoomMeetingId });
  }

  return ops;
}
