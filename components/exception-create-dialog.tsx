"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertCircle, CalendarPlus, Trash2 } from "lucide-react";
import { createException, scheduleKindLabel, ExceptionKind, Schedule, ScheduleKind } from "@/lib/automation";

interface ExceptionCreateDialogProps {
  schedules: Schedule[];
  onClose: () => void;
  onDone: () => void;
}

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function suggestSuppresses(eventDays: string[], schedules: Schedule[]): ScheduleKind[] {
  const weekdays = eventDays.map(weekdayOf);
  return schedules.filter((s) => weekdays.includes(s.weekday)).map((s) => s.kind);
}

export function ExceptionCreateDialog({ schedules, onClose, onDone }: ExceptionCreateDialogProps) {
  const [kind, setKind] = useState<ExceptionKind | null>(null);

  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [title, setTitle] = useState("");
  const [withBranchRep, setWithBranchRep] = useState(false);
  const [threeDays, setThreeDays] = useState(false);

  const [eventDays, setEventDays] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  const [suppresses, setSuppresses] = useState<ScheduleKind[]>([]);
  const [createsZoom, setCreatesZoom] = useState(false);
  const [label, setLabel] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addDate = () => {
    if (!newDate || eventDays.includes(newDate)) return;
    const next = [...eventDays, newDate].sort();
    setEventDays(next);
    setSuppresses(suggestSuppresses(next, schedules));
    setNewDate("");
  };

  const removeDate = (d: string) => {
    const next = eventDays.filter((x) => x !== d);
    setEventDays(next);
    setSuppresses(suggestSuppresses(next, schedules));
  };

  const toggleSuppress = (k: ScheduleKind) => {
    setSuppresses((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const handleConfirm = async () => {
    setError(null);

    if (kind === "assembly" && !date) {
      setError("Elegí una fecha.");
      return;
    }
    if (kind === "special_event" && eventDays.length === 0) {
      setError("Agregá al menos una fecha.");
      return;
    }

    setLoading(true);
    const result = await createException(
      kind === "assembly"
        ? {
            kind: "assembly",
            date,
            venue: venue || undefined,
            title: title || undefined,
            withBranchRep,
            threeDays,
          }
        : {
            kind: "special_event",
            eventDays,
            suppresses,
            createsZoom,
            label: label || undefined,
            venue: venue || undefined,
          },
    );
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "No se pudo crear la excepción.");
      return;
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-media-agua/10 flex items-center justify-center">
                <CalendarPlus className="w-5 h-5 text-media-agua" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">Nueva excepción</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Declarala antes de que el reconciliador llegue a esa semana.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {!kind ? (
            <div className="space-y-2">
              <button
                onClick={() => setKind("assembly")}
                className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Asamblea</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Suprime ambas reuniones de esa semana, sin Zoom.
                </p>
              </button>
              <button
                onClick={() => setKind("special_event")}
                className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">Acontecimiento especial</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Una o más fechas puntuales — elegís qué reuniones suprime.
                </p>
              </button>
            </div>
          ) : kind === "assembly" ? (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Título de la Asamblea (opcional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Asamblea de Circuito..."
                    className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={withBranchRep}
                    onChange={(e) => setWithBranchRep(e.target.checked)}
                    className="rounded border-slate-300 dark:border-zinc-700"
                  />
                  Con representante de la Sucursal
                </label>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    {threeDays ? "Día de inicio de la Asamblea" : "Día de la Asamblea"}
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={threeDays}
                    onChange={(e) => setThreeDays(e.target.checked)}
                    className="rounded border-slate-300 dark:border-zinc-700"
                  />
                  Asamblea de 3 días (calcula el día de cierre solo)
                </label>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Lugar (opcional)
                  </label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="Salón de Asambleas..."
                    className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setKind(null)}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg hover:bg-media-agua-dark transition-colors disabled:opacity-50"
                >
                  {loading ? "Aplicando..." : "Confirmar"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Fechas</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="flex-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                    />
                    <button
                      onClick={addDate}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                  {eventDays.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {eventDays.map((d) => (
                        <li
                          key={d}
                          className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-zinc-800/50 rounded-lg text-sm text-slate-700 dark:text-zinc-300"
                        >
                          {d}
                          <button onClick={() => removeDate(d)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Suprime</p>
                  <div className="space-y-1.5">
                    {schedules.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={suppresses.includes(s.kind)}
                          onChange={() => toggleSuppress(s.kind)}
                          className="rounded border-slate-300 dark:border-zinc-700"
                        />
                        {scheduleKindLabel(s.kind)}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={createsZoom}
                    onChange={(e) => setCreatesZoom(e.target.checked)}
                    className="rounded border-slate-300 dark:border-zinc-700"
                  />
                  Este evento necesita Zoom propio
                </label>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Lugar / motivo (opcional)
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setKind(null)}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg hover:bg-media-agua-dark transition-colors disabled:opacity-50"
                >
                  {loading ? "Aplicando..." : "Confirmar"}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
