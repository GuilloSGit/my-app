"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { AuthGuard } from "@/components/auth-guard";
import { OccurrenceStatusBadge } from "@/components/occurrence-status-badge";
import { CopyButton } from "@/components/copy-button";
import { ScheduleEditorDialog } from "@/components/schedule-editor-dialog";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { formatMeetingDate } from "@/lib/meetings";
import {
  getActiveSchedules,
  getUpcomingOccurrences,
  getLatestReconcileRuns,
  triggerZoomSync,
  scheduleKindLabel,
  WEEKDAY_LABEL,
  Schedule,
  Occurrence,
  ReconcileRunSummary,
} from "@/lib/automation";
import { CalendarClock, RefreshCw, Send, Pencil } from "lucide-react";

function formatScheduleSummary(schedule: Schedule): string {
  const time = schedule.localTime.slice(0, 5); // "HH:mm:ss" -> "HH:mm"
  return `${WEEKDAY_LABEL[schedule.weekday]}, ${time} (${schedule.timezone})`;
}

function formatLastRun(run: ReconcileRunSummary | undefined): string {
  if (!run) return "Todavía no corrió";
  if (!run.finishedAt) return "Corriendo...";
  const formatted = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(run.finishedAt));
  return run.issuesCount > 0
    ? `${formatted} (${run.issuesCount} aviso${run.issuesCount === 1 ? "" : "s"})`
    : formatted;
}

function AutomatizacionContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [runs, setRuns] = useState<ReconcileRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const userIsAdmin = isAdmin(user);

  // Este componente tiene su propio useAuth() (estado independiente del que
  // ya resolvió AuthGuard más arriba), así que arranca de nuevo en user=null
  // mientras carga su sesión — sin el guard de authLoading acá, isAdmin(null)
  // dispara el redirect a /dashboard antes de que la sesión real cargue.
  useEffect(() => {
    if (!authLoading && !userIsAdmin) {
      router.push("/dashboard");
    }
  }, [authLoading, userIsAdmin, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [activeSchedules, upcomingOccurrences, latestRuns] = await Promise.all([
      getActiveSchedules(),
      getUpcomingOccurrences(),
      getLatestReconcileRuns(),
    ]);
    setSchedules(activeSchedules);
    setOccurrences(upcomingOccurrences);
    setRuns(latestRuns);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (userIsAdmin) refresh();
  }, [userIsAdmin, refresh]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    const result = await triggerZoomSync();
    setSyncMessage(
      result.ok
        ? "Sincronización disparada. Puede tardar unos minutos en reflejarse acá."
        : `Error al sincronizar: ${result.error ?? "desconocido"}`,
    );
    setSyncing(false);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-500 dark:text-zinc-500">Cargando...</div>
      </div>
    );
  }

  if (!userIsAdmin) return null;

  return (
    <main className="min-h-screen pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-start justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 text-media-agua mb-2">
              <CalendarClock className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">
                Automatización de reuniones
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100">
              Vista de mes
            </h1>
            <p className="text-slate-600 dark:text-zinc-400 mt-1">
              Estado de las ocurrencias calculadas por el reconciliador. Solo lectura por ahora.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-media-agua text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Send className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
                Sincronizar ahora
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Recargar
              </button>
            </div>
            {syncMessage && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs text-right">
                {syncMessage}
              </p>
            )}
          </div>
        </motion.div>

        {schedules.length === 0 && !loading ? (
          <div className="text-center py-16 bg-white dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <CalendarClock className="w-16 h-16 text-slate-300 dark:text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 mb-2">
              No hay horarios configurados todavía
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
              El horario de entresemana y de fin de semana se cargan en la próxima iteración de esta
              función. Sin `meeting_schedules`, el reconciliador no tiene nada que calcular.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {schedules.map((schedule) => {
              const scheduleOccurrences = occurrences.filter((o) => o.scheduleId === schedule.id);
              const lastRun = runs.find((r) => r.scheduleId === schedule.id);

              return (
                <motion.div
                  key={schedule.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden"
                >
                  <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
                        {scheduleKindLabel(schedule.kind)}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-zinc-400">
                        {formatScheduleSummary(schedule)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-500 dark:text-zinc-500">
                        Última corrida: <span className="font-medium">{formatLastRun(lastRun)}</span>
                      </p>
                      <button
                        onClick={() => setEditingSchedule(schedule)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar horario
                      </button>
                    </div>
                  </div>

                  {scheduleOccurrences.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500 dark:text-zinc-400">
                      Sin ocurrencias calculadas en los próximos 35 días.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {scheduleOccurrences.map((occurrence) => (
                        <li key={occurrence.id} className="p-4 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-zinc-100 capitalize">
                                {formatMeetingDate(occurrence.startsAt)}
                              </p>
                              <p className="text-sm text-slate-600 dark:text-zinc-400 mt-0.5">
                                {occurrence.topic}
                              </p>
                              {occurrence.status === "blocked" && occurrence.blockedReason && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                  Motivo: {occurrence.blockedReason}
                                </p>
                              )}
                              {occurrence.origin === "manual" && (
                                <span className="inline-block mt-1 text-xs text-media-agua">
                                  Cargada a mano
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <OccurrenceStatusBadge status={occurrence.status} />
                              {occurrence.joinUrl && <CopyButton text={occurrence.joinUrl} label="Link" />}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {editingSchedule && (
        <ScheduleEditorDialog
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => {
            setEditingSchedule(null);
            refresh();
          }}
        />
      )}
    </main>
  );
}

export default function AutomatizacionPage() {
  return (
    <AuthGuard>
      <Navbar />
      <AutomatizacionContent />
    </AuthGuard>
  );
}
