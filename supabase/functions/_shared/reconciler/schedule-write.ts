import { addMonths } from "date-fns";
import type { Occurrence, Schedule } from "./types.ts";
import { expand } from "./expand.ts";
import { diffOccurrences } from "./diff.ts";

export interface ScheduleWriteOp {
  kind: "create" | "update" | "cancel";
  occurrenceId?: string; // update/cancel
  zoomMeetingId?: number | null; // update/cancel
  topic: string; // resultante (create/update) o previo (cancel)
  startsAt: string; // ISO, ídem
  previousTopic?: string; // solo update, si cambió
  previousStartsAt?: string; // solo update, si cambió
}

// Wrapper delgado sobre expand()/diffOccurrences() (ya escritos y
// testeados en Fase 1) para el editor de horario. `actual` debe venir ya
// filtrado por el caller (sin `cancelled` ni `pinned`, ordenado
// cronológicamente) — mismo contrato que diffOccurrences ya documenta.
//
// Horizonte de 1 mes desde `now`, igual que reconcileMonth — coherente
// con lo que ya calcula/muestra el resto de la feature (vista de mes).
//
// No toca agenda: DesiredOccurrence siempre trae agenda:null (expand() es
// un generador de calendario puro), así que el `update` resultante nunca
// carga agenda — la preservación de la agenda real de cada fila es
// responsabilidad de la función SQL que aplica el update
// (schedule_write_update_occurrence), no de esta capa.
export function computeScheduleWriteOps(
  schedule: Schedule,
  actual: Occurrence[],
  now: Date,
): ScheduleWriteOp[] {
  const desired = expand(schedule, now, addMonths(now, 1));
  const ops = diffOccurrences(desired, actual);

  return ops.map((op) => {
    if (op.kind === "create") {
      return {
        kind: "create",
        topic: op.to.topic,
        startsAt: op.to.startsAt.toISOString(),
      };
    }

    if (op.kind === "cancel") {
      const original = actual.find((a) => a.id === op.id);
      return {
        kind: "cancel",
        occurrenceId: op.id,
        zoomMeetingId: op.zoomMeetingId,
        topic: original?.topic ?? "",
        startsAt: (original?.startsAt ?? new Date(0)).toISOString(),
      };
    }

    const original = actual.find((a) => a.id === op.id);
    const startsAtChanged = original && original.startsAt.getTime() !== op.to.startsAt.getTime();
    const topicChanged = original && original.topic !== op.to.topic;

    return {
      kind: "update",
      occurrenceId: op.id,
      zoomMeetingId: op.zoomMeetingId,
      topic: op.to.topic,
      startsAt: op.to.startsAt.toISOString(),
      previousTopic: topicChanged ? original!.topic : undefined,
      previousStartsAt: startsAtChanged ? original!.startsAt.toISOString() : undefined,
    };
  });
}
