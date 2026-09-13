"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertCircle, CalendarClock, ArrowRight } from "lucide-react";
import { formatMeetingDate } from "@/lib/meetings";
import {
  writeSchedule,
  scheduleKindLabel,
  WEEKDAY_LABEL,
  Schedule,
  ScheduleWriteOp,
} from "@/lib/automation";

interface ScheduleEditorDialogProps {
  schedule: Schedule;
  onClose: () => void;
  onSaved: () => void;
}

function opLine(op: ScheduleWriteOp): string {
  if (op.kind === "create") return `Crear — ${formatMeetingDate(op.startsAt)}`;
  if (op.kind === "cancel") return `Cancelar — ${formatMeetingDate(op.startsAt)}`;
  if (op.previousStartsAt) {
    return `Mover — ${formatMeetingDate(op.previousStartsAt)} → ${formatMeetingDate(op.startsAt)}`;
  }
  return `Actualizar — ${formatMeetingDate(op.startsAt)} (duración)`;
}

export function ScheduleEditorDialog({ schedule, onClose, onSaved }: ScheduleEditorDialogProps) {
  const [weekday, setWeekday] = useState(schedule.weekday);
  const [localTime, setLocalTime] = useState(schedule.localTime.slice(0, 5));
  const [durationMinutes, setDurationMinutes] = useState(schedule.durationMinutes);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [ops, setOps] = useState<ScheduleWriteOp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { scheduleId: schedule.id, weekday, localTime, durationMinutes };

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    const result = await writeSchedule({ ...input, commit: false });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOps(result.ops);
    setStep("preview");
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const result = await writeSchedule({ ...input, commit: true });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.errors.length > 0) {
      setError(
        `Algunos cambios no se pudieron aplicar: ${result.errors.join("; ")}. Volvé a previsualizar para reintentar.`,
      );
      return;
    }
    onSaved();
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
                <CalendarClock className="w-5 h-5 text-media-agua" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
                  Editar horario
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  {scheduleKindLabel(schedule.kind)}
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

          {step === "form" ? (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    Día de la semana
                  </label>
                  <select
                    value={weekday}
                    onChange={(e) => setWeekday(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                  >
                    {WEEKDAY_LABEL.map((label, value) => (
                      <option key={value} value={value} className="capitalize">
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Hora
                    </label>
                    <input
                      type="time"
                      value={localTime}
                      onChange={(e) => setLocalTime(e.target.value)}
                      className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Duración (min)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-zinc-500">
                  Zona horaria: {schedule.timezone} (no editable acá)
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePreview}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg hover:bg-media-agua-dark transition-colors disabled:opacity-50"
                >
                  {loading ? "Calculando..." : "Ver cambios"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-3">
                  {ops.length === 0
                    ? "Sin cambios que aplicar."
                    : `${ops.length} cambio${ops.length === 1 ? "" : "s"} en los próximos 30 días:`}
                </p>
                {ops.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {ops.map((op, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-zinc-800/50 rounded-lg text-slate-700 dark:text-zinc-300"
                      >
                        <ArrowRight className="w-4 h-4 text-media-agua flex-shrink-0" />
                        {opLine(op)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("form")}
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
                  {loading ? "Guardando..." : "Confirmar y guardar"}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
