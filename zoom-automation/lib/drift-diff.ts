// drift-check corre cada 10hs (2026-09-19): sin esto, una divergencia que
// sigue sin arreglar mandaría un mail idéntico 3 veces por día. Se avisa
// solo por las divergencias que NO estaban en la corrida anterior; todas
// quedan igual guardadas en drift_check_runs y visibles en el panel.
// La clave incluye `detail`: si un mismatch cambia (ej. otra hora real),
// cuenta como nuevo y vuelve a avisar.
export interface DriftIssueKey {
  type: string;
  zoomMeetingId: number;
  detail: string;
}

const keyOf = (issue: DriftIssueKey) => `${issue.type}|${issue.zoomMeetingId}|${issue.detail}`;

export function newIssues<T extends DriftIssueKey>(previous: DriftIssueKey[] | null, current: T[]): T[] {
  if (!previous) return current;
  const seen = new Set(previous.map(keyOf));
  return current.filter((issue) => !seen.has(keyOf(issue)));
}
