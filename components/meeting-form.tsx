"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Meeting, createMeeting, updateMeeting, validateMeeting } from "@/lib/meetings";
import { ParsedZoomMeeting } from "@/lib/zoom-parser";
import { Calendar, Video, Hash, Lock, FileText, X, Save, AlertCircle, Loader2 } from "lucide-react";

interface MeetingFormProps {
  meeting?: Meeting;
  zoomData?: Partial<ParsedZoomMeeting>;
  onSave: () => void;
  onCancel: () => void;
}

export function MeetingForm({ meeting, zoomData, onSave, onCancel }: MeetingFormProps) {
  const isEditing = !!meeting;
  const isFromZoom = !!zoomData;
  
  const getInitialData = () => {
    if (meeting) {
      return {
        date: new Date(meeting.date).toISOString().slice(0, 16),
        title: meeting.title,
        zoomLink: meeting.zoomLink,
        zoomId: meeting.zoomId,
        passcode: meeting.passcode,
      };
    }
    if (zoomData) {
      // Si la fecha ya tiene offset, usarla directamente. Si no, convertir a ISO
      let dateStr = "";
      if (zoomData.date) {
        if (zoomData.date.includes("+") || zoomData.date.includes("-")) {
          // Ya tiene offset, usar directamente (quitar el offset para datetime-local pero mantener segundos)
          const match = zoomData.date.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
          dateStr = match ? match[1] : zoomData.date.slice(0, 19);
        } else {
          // Sin offset, convertir a ISO local
          dateStr = new Date(zoomData.date).toISOString().slice(0, 16);
        }
      }
      return {
        date: dateStr,
        title: zoomData.title || "",
        zoomLink: zoomData.zoomLink || "",
        zoomId: zoomData.zoomId || "",
        passcode: zoomData.passcode || "",
      };
    }
    return {
      date: "",
      title: "",
      zoomLink: "",
      zoomId: "",
      passcode: "",
    };
  };
  
  const [formData, setFormData] = useState(getInitialData);
  
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const validationError = validateMeeting({
      date: formData.date,
      title: formData.title,
      zoomLink: formData.zoomLink,
      zoomId: formData.zoomId,
      passcode: formData.passcode,
    });
    
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Convertir fecha a ISO con offset de Buenos Aires
      let dateToSave: string;
      if (formData.date.includes("+") || formData.date.includes("-")) {
        // Ya tiene offset, agregar offset de Buenos Aires si no lo tiene
        dateToSave = formData.date.includes("+") || formData.date.match(/-\d{2}:\d{2}$/)
          ? formData.date
          : formData.date + "-03:00";
      } else {
        // Sin offset, convertir a ISO local y agregar offset de Buenos Aires
        const localDate = new Date(formData.date);
        dateToSave = localDate.toISOString().slice(0, 19) + "-03:00";
      }

      if (isEditing && meeting) {
        await updateMeeting(meeting.id, {
          date: dateToSave,
          title: formData.title,
          zoomLink: formData.zoomLink,
          zoomId: formData.zoomId,
          passcode: formData.passcode,
        });
      } else {
        await createMeeting({
          date: dateToSave,
          title: formData.title,
          zoomLink: formData.zoomLink,
          zoomId: formData.zoomId,
          passcode: formData.passcode,
        });
      }
      onSave();
    } catch (err) {
      setError("Error al guardar la reunión");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClasses = `
    w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-zinc-800
    text-slate-900 dark:text-zinc-100
    border-slate-300 dark:border-zinc-700
    focus:ring-2 focus:ring-media-agua focus:border-media-agua
    outline-none transition-all
  `;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
              {isEditing ? "Editar Reunión" : isFromZoom ? "Reunión desde Zoom" : "Nueva Reunión"}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Título
                </span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej: Reunión General"
                className={inputClasses}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Fecha y Hora
                </span>
              </label>
              <input
                type="datetime-local"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className={inputClasses}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                <span className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Link de Zoom
                </span>
              </label>
              <input
                type="url"
                value={formData.zoomLink}
                onChange={(e) => setFormData({ ...formData, zoomLink: e.target.value })}
                placeholder="https://zoom.us/j/..."
                className={inputClasses}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    ID de Reunión
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.zoomId}
                  onChange={(e) => setFormData({ ...formData, zoomId: e.target.value })}
                  placeholder="123 456 7890"
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Contraseña
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.passcode}
                  onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
                  placeholder="mediaagua"
                  className={inputClasses}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg hover:bg-media-agua-dark transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isEditing ? "Guardar" : "Crear"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
