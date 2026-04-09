"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseZoomMessage, ParsedZoomMeeting, isValidZoomMessage } from "@/lib/zoom-parser";
import { MessageSquare, X, AlertCircle, CheckCircle, FileText } from "lucide-react";

interface ZoomImportDialogProps {
  onParsed: (data: Partial<ParsedZoomMeeting>) => void;
  onCancel: () => void;
}

export function ZoomImportDialog({ onParsed, onCancel }: ZoomImportDialogProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Partial<ParsedZoomMeeting> | null>(null);

  const handleParse = () => {
    setError(null);
    
    if (!text.trim()) {
      setError("Por favor pega el mensaje de Zoom");
      return;
    }
    
    if (!isValidZoomMessage(text)) {
      setError("El texto no parece ser un mensaje de Zoom válido");
      return;
    }
    
    const parsed = parseZoomMessage(text);
    
    if (!parsed || (!parsed.title && !parsed.zoomLink)) {
      setError("No se pudieron extraer los datos del mensaje. Verifica el formato.");
      return;
    }
    
    setPreview(parsed);
  };

  const handleConfirm = () => {
    if (preview) {
      onParsed(preview);
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    setError(null);
    setPreview(null);
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
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
                  Pegar desde Zoom
                </h2>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Pega el mensaje de invitación
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!preview ? (
            <>
              <div className="mb-4">
                <textarea
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={`Cong. Media Agua le está invitando a una reunión de Zoom programada.

Tema: Reunión de Fin de Semana
Hora: 11 abr 2026 06:00 p. m. Buenos Aires...

ID de reunión: 893 4991 0935
Código de acceso: 001914`}
                  rows={10}
                  className="w-full p-4 rounded-lg border bg-white dark:bg-zinc-800 
                    text-slate-900 dark:text-zinc-100 text-sm font-mono
                    border-slate-300 dark:border-zinc-700
                    focus:ring-2 focus:ring-media-agua focus:border-media-agua
                    outline-none resize-none transition-all"
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 
                    text-slate-700 dark:text-zinc-300 rounded-lg 
                    hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleParse}
                  className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg 
                    hover:bg-media-agua-dark transition-colors"
                >
                  Analizar mensaje
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-500/10 rounded-xl border border-green-200 dark:border-green-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Datos extraídos correctamente:
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  {preview.title && (
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Título</p>
                        <p className="font-medium text-slate-900 dark:text-zinc-100">{preview.title}</p>
                      </div>
                    </div>
                  )}
                  
                  {preview.date && (
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Fecha</p>
                        <p className="font-medium text-slate-900 dark:text-zinc-100">
                          {new Date(preview.date).toLocaleString("es-AR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {preview.zoomLink && (
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Link</p>
                        <p className="font-medium text-slate-900 dark:text-zinc-100 truncate max-w-[250px]">
                          {preview.zoomLink}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {preview.zoomId && (
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">ID</p>
                        <p className="font-medium text-slate-900 dark:text-zinc-100">{preview.zoomId}</p>
                      </div>
                    </div>
                  )}
                  
                  {preview.passcode && (
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Contraseña</p>
                        <p className="font-medium text-slate-900 dark:text-zinc-100">{preview.passcode}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPreview(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-zinc-700 
                    text-slate-700 dark:text-zinc-300 rounded-lg 
                    hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2.5 bg-media-agua text-white rounded-lg 
                    hover:bg-media-agua-dark transition-colors"
                >
                  Confirmar y editar
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
