import { OccurrenceStatus, occurrenceStatusLabel } from "@/lib/automation";

const STATUS_STYLES: Record<OccurrenceStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  synced: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  blocked: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-500 line-through",
};

export function OccurrenceStatusBadge({ status }: { status: OccurrenceStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {occurrenceStatusLabel(status)}
    </span>
  );
}
