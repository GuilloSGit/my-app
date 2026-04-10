"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Meeting, formatMeetingDate, deleteMeeting } from "@/lib/meetings";
import { CopyButton } from "./copy-button";
import { WhatsAppShare } from "./whatsapp-share";
import { Calendar, Video, Hash, Lock, ChevronDown, ChevronUp, Pencil, Trash2, Loader2 } from "lucide-react";

interface MeetingCardProps {
  meeting: Meeting;
  isAdmin?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MeetingCard({ meeting, isAdmin, onEdit, onDelete }: MeetingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formattedDate = formatMeetingDate(meeting.date);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header - Always visible */}
      <div
        className="p-6 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-media-agua mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-sm font-medium">{formattedDate}</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
              {meeting.title}
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

        {/* Quick Actions - Always visible */}
        <div className="flex flex-wrap gap-3 mt-4 items-center">
          <a
            href={meeting.zoomLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-media-agua hover:bg-media-agua-dark text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Video className="w-4 h-4" />
            Unirse a Zoom
          </a>
          <WhatsAppShare meeting={meeting} />
          
          {/* Admin Actions */}
          {isAdmin && (
            <div className="flex gap-2 ml-auto" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
                className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors"
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="p-2 rounded-lg bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-xl p-6 max-w-sm w-full"
            >
              <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">
                ¿Eliminar reunión?
              </h3>
              <p className="text-slate-600 dark:text-zinc-400 mb-6">
                Esta acción no se puede deshacer. ¿Estás seguro de eliminar "{meeting.title}"?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true);
                    await deleteMeeting(meeting.id);
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                    onDelete?.();
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    "Eliminar"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Details */}
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
              {/* Zoom Link */}
              <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Video className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Link de Zoom</p>
                    <p className="text-sm text-slate-900 dark:text-zinc-100 truncate">{meeting.zoomLink}</p>
                  </div>
                </div>
                <CopyButton text={meeting.zoomLink} label="Link" />
              </div>

              {/* Meeting ID */}
              <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">ID de Reunión</p>
                    <p className="text-lg font-mono font-semibold text-slate-900 dark:text-zinc-100 tracking-wider">
                      {meeting.zoomId}
                    </p>
                  </div>
                </div>
                <CopyButton text={meeting.zoomId} label="ID" />
              </div>

              {/* Passcode */}
              <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-zinc-800 rounded-lg border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Contraseña</p>
                    <p className="text-lg font-mono font-semibold text-slate-900 dark:text-zinc-100">
                      {meeting.passcode}
                    </p>
                  </div>
                </div>
                <CopyButton text={meeting.passcode} label="Pass" />
              </div>

              {/* Share Section */}
              <div className="pt-4 border-t border-slate-200 dark:border-zinc-700">
                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-3">
                  Compartir con la congregación:
                </p>
                <WhatsAppShare meeting={meeting} expanded />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
