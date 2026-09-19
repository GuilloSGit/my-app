"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { AuthGuard } from "@/components/auth-guard";
import { OccurrenceStatusBadge } from "@/components/occurrence-status-badge";
import { CopyButton } from "@/components/copy-button";
import { OccurrenceWhatsAppShare } from "@/components/occurrence-whatsapp-share";
import { ScheduleEditorDialog } from "@/components/schedule-editor-dialog";
import { OccurrenceActionDialog } from "@/components/occurrence-action-dialog";
import { ExceptionCreateDialog } from "@/components/exception-create-dialog";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { formatMeetingDate } from "@/lib/meetings";
import {
  getActiveSchedules,
  getUpcomingOccurrences,
  getLatestReconcileRuns,
  triggerZoomSync,
  triggerZoomSessionCheck,
  getLatestZoomSessionCheck,
  triggerDriftCheck,
  getLatestDriftCheckRun,
  scheduleKindLabel,
  WEEKDAY_LABEL,
  Schedule,
  Occurrence,
  ReconcileRunSummary,
  ZoomSessionCheck,
  DriftCheckRun,
} from "@/lib/automation";
import { CalendarClock, RefreshCw, Send, Pencil, ListChecks, CalendarPlus, ShieldCheck, SearchCheck } from "lucide-react";

function formatSessionCheck(check: ZoomSessionCheck | null): string {
  if (!check) return "Sesión de Zoom: sin verificar todavía.";
  const when = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(check.checkedAt),
  );
  if (!check.ok) {
    return `Sesión de Zoom: VENCIDA (verificado ${when}) — hay que recapturarla con "npm run zoom:capture-session", desde una terminal real.`;
  }
  // Constancia de que se entró de verdad (chequeos nuevos; los viejos no la traen).
  const evidence = [
    check.meetingsSeen != null ? `${check.meetingsSeen} reuniones vistas` : null,
    check.accountLabel ?? null,
  ].filter(Boolean);
  return evidence.length > 0
    ? `Sesión de Zoom: OK — ${evidence.join(", ")} (verificado ${when}).`
    : `Sesión de Zoom: OK (verificado ${when}).`;
}

function formatScheduleSummary(schedule: Schedule): string {
  const time = schedule.localTime.slice(0, 5); // "HH:mm:ss" -> "HH:mm"
  return `${WEEKDAY_LABEL[schedule.weekday]}, ${time} (${schedule.timezone})`;
}

function formatDriftCheck(run: DriftCheckRun | null): string {
  if (!run) return "Divergencias: sin chequear todavía.";
  if (!run.finishedAt) return "Divergencias: corriendo...";
  const when = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(run.finishedAt),
  );
  return run.issues.length === 0
    ? `Divergencias: sin novedad (verificado ${when}).`
    : `Divergencias: ${run.issues.length} encontrada${run.issues.length === 1 ? "" : "s"} (verificado ${when}).`;
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
  const [sessionCheck, setSessionCheck] = useState<ZoomSessionCheck | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [driftCheck, setDriftCheck] = useState<DriftCheckRun | null>(null);
  const [checkingDrift, setCheckingDrift] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [actionOccurrence, setActionOccurrence] = useState<Occurrence | null>(null);
  const [creatingException, setCreatingException] = useState(false);

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
    const [activeSchedules, upcomingOccurrences, latestRuns, latestSessionCheck, latestDriftCheck] = await Promise.all([
      getActiveSchedules(),
      getUpcomingOccurrences(),
      getLatestReconcileRuns(),
      getLatestZoomSessionCheck(),
      getLatestDriftCheckRun(),
    ]);
    setSchedules(activeSchedules);
    setOccurrences(upcomingOccurrences);
    setRuns(latestRuns);
    setSessionCheck(latestSessionCheck);
    setDriftCheck(latestDriftCheck);
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

  const handleCheckSession = useCallback(async () => {
    setCheckingSession(true);
    const result = await triggerZoomSessionCheck();
    if (!result.ok) {
      setCheckingSession(false);
      setSessionCheck({ checkedAt: new Date().toISOString(), ok: false, message: `Error al disparar el chequeo: ${result.error ?? "desconocido"}` });
      return;
    }
    // El workflow de GitHub Actions tarda ~1 min en instalar Chromium y
    // correr — se refresca la lectura después de una espera fija en vez
    // de pollear, mismo criterio simple que ya usa "Sincronizar ahora"
    // (que ni siquiera refresca solo, deja el mensaje fijo).
    setTimeout(async () => {
      await refresh();
      setCheckingSession(false);
    }, 60_000);
  }, [refresh]);

  const handleCheckDrift = useCallback(async () => {
    setCheckingDrift(true);
    const result = await triggerDriftCheck();
    if (!result.ok) {
      setCheckingDrift(false);
      setDriftCheck({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), issues: [] });
      return;
    }
    // Este workflow además recorre cada ocurrencia trackeada contra Zoom
    // real (no solo la lista) — tarda más que "Verificar sesión de Zoom",
    // se le da el doble de margen antes de refrescar.
    setTimeout(async () => {
      await refresh();
      setCheckingDrift(false);
    }, 120_000);
  }, [refresh]);

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
          className="mb-8 space-y-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 shrink-0 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Recargar vista
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-zinc-500">
            Guía rápida para operar este panel — pensada para que cualquier otro admin pueda
            hacerse cargo sin tener que preguntar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-media-agua">
                  1. Excepciones puntuales
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Para eventos especiales de un día o una semana (Asamblea, transmisión de
                  JW Stream por visita de la Sucursal Mundial, etc.): cancelar una reunión
                  de entresemana y/o mover un horario.
                </p>
              </div>
              <button
                onClick={() => setCreatingException(true)}
                className="self-start inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors whitespace-nowrap"
              >
                <CalendarPlus className="w-4 h-4" />
                Nueva excepción
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-media-agua">
                  2. Sincronización con Zoom
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Empuja ya los cambios pendientes a la cuenta real de Zoom. Se hace solo cada
                  10 horas; usá este botón si necesitás que se refleje antes.
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="self-start inline-flex items-center gap-2 px-3 py-1.5 bg-media-agua text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
              >
                <Send className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
                Sincronizar ahora
              </button>
              {syncMessage && (
                <p className="text-xs text-slate-500 dark:text-zinc-400">{syncMessage}</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-media-agua">
                  3. Diagnóstico: sesión de Zoom
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Chequea que el login guardado para operar Zoom siga activo. Si dice
                  &quot;VENCIDA&quot;, hay que recapturarla desde una terminal (ver README).
                </p>
              </div>
              <button
                onClick={handleCheckSession}
                disabled={checkingSession}
                className="self-start inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <ShieldCheck className={`w-4 h-4 ${checkingSession ? "animate-pulse" : ""}`} />
                Verificar sesión
              </button>
              <p
                className={`text-xs ${
                  sessionCheck && !sessionCheck.ok
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-zinc-400"
                }`}
              >
                {checkingSession ? "Verificando..." : formatSessionCheck(sessionCheck)}
                {!checkingSession && sessionCheck?.runUrl && (
                  <>
                    {" "}
                    <a
                      href={sessionCheck.runUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-media-agua"
                    >
                      Ver constancia
                    </a>
                  </>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-media-agua">
                  4. Diagnóstico: coincide con Zoom real
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Compara todas las reuniones de la cuenta de Zoom contra lo guardado acá y
                  avisa si algo no coincide. No corrige nada solo.
                </p>
              </div>
              <button
                onClick={handleCheckDrift}
                disabled={checkingDrift}
                className="self-start inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <SearchCheck className={`w-4 h-4 ${checkingDrift ? "animate-pulse" : ""}`} />
                Chequear divergencias
              </button>
              <p
                className={`text-xs ${
                  driftCheck && driftCheck.issues.length > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-500 dark:text-zinc-400"
                }`}
              >
                {checkingDrift ? "Chequeando..." : formatDriftCheck(driftCheck)}
              </p>
            </div>
          </div>
        </motion.div>

        {driftCheck && driftCheck.issues.length > 0 && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
              Divergencias encontradas contra la cuenta real de Zoom
            </h2>
            <ul className="space-y-1.5 text-sm text-red-700 dark:text-red-400">
              {driftCheck.issues.map((issue, i) => (
                <li key={i}>
                  <span className="font-medium">[{issue.type}]</span> Zoom {issue.zoomMeetingId} &ldquo;{issue.topic}
                  &rdquo; — {issue.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

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
                              {occurrence.joinUrl && (
                                <>
                                  <CopyButton text={occurrence.joinUrl} label="Link" />
                                  <OccurrenceWhatsAppShare occurrence={occurrence} />
                                </>
                              )}
                              {occurrence.status !== "cancelled" && (
                                <button
                                  onClick={() => setActionOccurrence(occurrence)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                  <ListChecks className="w-3.5 h-3.5" />
                                  Acciones
                                </button>
                              )}
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

      {actionOccurrence && (
        <OccurrenceActionDialog
          occurrence={actionOccurrence}
          onClose={() => setActionOccurrence(null)}
          onDone={() => {
            setActionOccurrence(null);
            refresh();
          }}
        />
      )}

      {creatingException && (
        <ExceptionCreateDialog
          schedules={schedules}
          onClose={() => setCreatingException(false)}
          onDone={() => {
            setCreatingException(false);
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
