"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatMeetingDate } from "@/lib/meetings";
import { Occurrence, stripLinksFromAgenda } from "@/lib/automation";
import { CopyButton } from "./copy-button";
import { OccurrenceWhatsAppShare } from "./occurrence-whatsapp-share";
import { Calendar, Video, Hash, Lock, ChevronDown, ChevronUp, FileText } from "lucide-react";

interface OccurrenceMeetingCardProps {
  occurrence: Occurrence;
}

// Versión de solo lectura de MeetingCard para /dashboard, sobre
// meeting_occurrences en vez de la tabla vieja meetings — sin acciones de
// admin (editar/eliminar viven en /dashboard/automatizacion).
export function OccurrenceMeetingCard({ occurrence }: OccurrenceMeetingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formattedDate = formatMeetingDate(occurrence.startsAt);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-media-agua mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">{formattedDate}</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
              {occurrence.topic}
            </h3>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </motion.div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 items-center">
          {occurrence.joinUrl && (
            <a
              href={occurrence.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-media-agua hover:bg-media-agua-dark text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Video className="w-4 h-4" />
              Unirse a Zoom
            </a>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <OccurrenceWhatsAppShare occurrence={occurrence} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-slate-200 dark:border-zinc-800"
          >
            <div className="p-6 space-y-4 bg-slate-50/50 dark:bg-zinc-800/30">
              {occurrence.joinUrl && (
                <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Video className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Link de Zoom</p>
                      <p className="text-sm text-slate-900 dark:text-zinc-100 truncate">{occurrence.joinUrl}</p>
                    </div>
                  </div>
                  <CopyButton text={occurrence.joinUrl} label="Link" />
                </div>
              )}

              {occurrence.zoomMeetingId && (
                <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <Hash className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">ID de Reunión</p>
                      <p className="text-lg font-mono font-semibold text-slate-900 dark:text-zinc-100 tracking-wider">
                        {occurrence.zoomMeetingId}
                      </p>
                    </div>
                  </div>
                  <CopyButton text={String(occurrence.zoomMeetingId)} label="ID" />
                </div>
              )}

              {occurrence.passcode && (
                <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Contraseña</p>
                      <p className="text-lg font-mono font-semibold text-slate-900 dark:text-zinc-100">
                        {occurrence.passcode}
                      </p>
                    </div>
                  </div>
                  <CopyButton text={occurrence.passcode} label="Pass" />
                </div>
              )}

              {occurrence.agenda && (
                <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Temas de esta reunión
                    </p>
                    <p className="text-sm text-slate-900 dark:text-zinc-100 whitespace-pre-line">
                      {stripLinksFromAgenda(occurrence.agenda)}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-zinc-700">
                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-3">
                  Compartir con la congregación:
                </p>
                <OccurrenceWhatsAppShare occurrence={occurrence} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
