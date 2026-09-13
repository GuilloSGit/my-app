"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertCircle, ListChecks } from "lucide-react";
import { formatMeetingDate } from "@/lib/meetings";
import { occurrenceAction, OccurrenceActionKind, Occurrence } from "@/lib/automation";

interface OccurrenceActionDialogProps {
  occurrence: Occurrence;
  onClose: () => void;
  onDone: () => void;
}

interface ActionDef {
  kind: OccurrenceActionKind;
  label: string;
  description: string;
}

const BLOCKED_ACTIONS: ActionDef[] = [
  { kind: "mark_assembly", label: "Marcar Asamblea", description: "Suprime ambas reuniones de esta semana, sin Zoom." },
  { kind: "mark_memorial", label: "Marcar Conmemoración", description: "Crea la reunión de la Conmemoración en su fecha real, con Zoom." },
  { kind: "create_without_content", label: "Crear igual sin contenido", description: "Crea la reunión ya, sin agenda de WOL — se puede cargar después." },
  { kind: "cancel", label: "Cancelar esta reunión", description: "Cancela esta fecha y evita que el reconciliador la vuelva a crear." },
];

const MOVE_ACTION: ActionDef = {
  kind: "move",
  label: "Mover a otro día",
  description: "Cancela esta fecha y crea la reunión real en otro día/hora.",
};

export function OccurrenceActionDialog({ occurrence, onClose, onDone }: OccurrenceActionDialogProps) {
  const availableActions = occurrence.status === "blocked" ? [...BLOCKED_ACTIONS, MOVE_ACTION] : [MOVE_ACTION];

  const [selected, setSelected] = useState<OccurrenceActionKind | null>(
    availableActions.length === 1 ? availableActions[0].kind : null,
  );
  const [reason, setReason] = useState("");
  const [venue, setVenue] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDef = availableActions.find((a) => a.kind === selected) ?? null;

  const needsDateTime = selected === "move" || selected === "mark_memorial";

  const handleConfirm = async () => {
    if (!selected) return;
    if (needsDateTime && (!date || !time)) {
      setError("Completá fecha y hora.");
      return;
    }

    setLoading(true);
    setError(null);
    const result = await occurrenceAction({
      occurrenceId: occurrence.id,
      action: selected,
      reason: reason || undefined,
      venue: venue || undefined,
      label: label || undefined,
      date: needsDateTime ? date : undefined,
      time: needsDateTime ? time : undefined,
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "No se pudo aplicar la acción.");
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
                <ListChecks className="w-5 h-5 text-media-agua" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">Acciones</h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  {formatMeetingDate(occurrence.startsAt)}
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

          {!selected ? (
            <div className="space-y-2">
              {availableActions.map((a) => (
                <button
                  key={a.kind}
                  onClick={() => setSelected(a.kind)}
                  className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">{a.label}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{a.description}</p>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">{selectedDef?.label}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{selectedDef?.description}</p>
              </div>

              <div className="space-y-4 mb-6">
                {needsDateTime && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Fecha</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Hora</label>
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                      />
                    </div>
                  </div>
                )}

                {selected === "move" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Visita del superintendente de circuito"
                      className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                    />
                  </div>
                )}

                {selected === "cancel" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full p-2.5 rounded-lg border bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border-slate-300 dark:border-zinc-700 focus:ring-2 focus:ring-media-agua focus:border-media-agua outline-none"
                    />
                  </div>
                )}

                {selected === "mark_assembly" && (
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
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => (availableActions.length === 1 ? onClose() : setSelected(null))}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {availableActions.length === 1 ? "Cancelar" : "Volver"}
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
