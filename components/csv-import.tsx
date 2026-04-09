"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import Papa from "papaparse";
import { importMeetings, validateMeeting, Meeting } from "@/lib/meetings";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from "lucide-react";

interface CsvImportProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface CsvRow {
  fecha?: string;
  date?: string;
  titulo?: string;
  title?: string;
  link?: string;
  zoomlink?: string;
  zoomLink?: string;
  "link zoom"?: string;
  id?: string;
  zoomid?: string;
  zoomId?: string;
  "id reunion"?: string;
  "id de reunion"?: string;
  passcode?: string;
  password?: string;
  contraseña?: string;
  pass?: string;
  [key: string]: string | undefined;
}

export function CsvImport({ onSuccess, onCancel }: CsvImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setResult({ success: 0, errors: ["Solo se permiten archivos CSV o TXT"] });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const validMeetings: Omit<Meeting, "id">[] = [];

        results.data.forEach((row, index) => {
          const rowNum = index + 2; // +2 because header is row 1

          // Detectar columnas con diferentes nombres posibles
          const dateStr = row.fecha || row.date || row.Fecha || row.Date || "";
          const title = row.titulo || row.title || row.Titulo || row.Title || "";
          const zoomLink = row.link || row.zoomlink || row.zoomLink || row["link zoom"] || row["Link Zoom"] || row["Link"] || "";
          const zoomId = row.id || row.zoomid || row.zoomId || row["id reunion"] || row["ID Reunion"] || row["id de reunion"] || "";
          const passcode = row.passcode || row.password || row.contraseña || row.pass || row.Passcode || row.Password || "";

          if (!dateStr && !title && !zoomLink) {
            return; // Skip empty rows
          }

          // Parsear fecha - soporta múltiples formatos
          let parsedDate: string | null = null;
          
          // Intentar ISO primero
          const isoDate = new Date(dateStr);
          if (!isNaN(isoDate.getTime())) {
            parsedDate = isoDate.toISOString();
          }
          
          // Intentar formato dd/mm/yyyy o dd-mm-yyyy
          if (!parsedDate) {
            const parts = dateStr.split(/[/-]/);
            if (parts.length === 3) {
              const [day, month, year] = parts;
              const fullYear = year.length === 2 ? `20${year}` : year;
              const dateObj = new Date(`${fullYear}-${month}-${day}T19:00:00`);
              if (!isNaN(dateObj.getTime())) {
                parsedDate = dateObj.toISOString();
              }
            }
          }

          // Intentar formato mm/dd/yyyy
          if (!parsedDate) {
            const usDate = new Date(dateStr);
            if (!isNaN(usDate.getTime())) {
              parsedDate = usDate.toISOString();
            }
          }

          const meeting: Partial<Meeting> = {
            date: parsedDate || dateStr,
            title: title.trim(),
            zoomLink: zoomLink.trim(),
            zoomId: zoomId.trim(),
            passcode: passcode.trim(),
          };

          const error = validateMeeting(meeting);
          if (error) {
            errors.push(`Fila ${rowNum}: ${error}`);
          } else if (meeting.date && meeting.title && meeting.zoomLink && meeting.zoomId && meeting.passcode) {
            validMeetings.push({
              date: meeting.date,
              title: meeting.title,
              zoomLink: meeting.zoomLink,
              zoomId: meeting.zoomId,
              passcode: meeting.passcode,
            });
          }
        });

        if (validMeetings.length > 0) {
          importMeetings(validMeetings);
        }

        setResult({
          success: validMeetings.length,
          errors: errors.slice(0, 10), // Mostrar máximo 10 errores
        });
        setIsProcessing(false);

        if (validMeetings.length > 0 && errors.length === 0) {
          setTimeout(onSuccess, 1500);
        }
      },
      error: (error) => {
        setResult({ success: 0, errors: [`Error al procesar: ${error.message}`] });
        setIsProcessing(false);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-lg w-full p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">
            Importar Reuniones
          </h2>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${isDragging 
                  ? "border-media-agua bg-media-agua/5" 
                  : "border-slate-300 dark:border-zinc-700 hover:border-media-agua hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {isProcessing ? (
                <div className="py-4">
                  <div className="animate-spin w-8 h-8 border-2 border-media-agua border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-zinc-400">Procesando archivo...</p>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-media-agua/10 text-media-agua flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-slate-700 dark:text-zinc-300 font-medium mb-2">
                    Arrastra un archivo CSV aquí o haz clic para seleccionar
                  </p>
                  <p className="text-sm text-slate-500 dark:text-zinc-500">
                    Formato: fecha, título, link, id, contraseña
                  </p>
                </>
              )}
            </div>

            <div className="mt-6 p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">
                Formato esperado del CSV:
              </p>
              <code className="text-xs text-slate-600 dark:text-zinc-400 block">
                fecha,titulo,link,id,contraseña<br/>
                2026-04-15T19:00:00,Reunión General,https://zoom.us/j/123,123 456 7890,mediaagua
              </code>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
                También acepta: date, title, zoomLink, zoomId, passcode
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {result.success > 0 && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <p className="text-green-700 dark:text-green-400 font-medium">
                  {result.success} reuniones importadas correctamente
                </p>
              </div>
            )}
            
            {result.errors.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <p className="text-red-700 dark:text-red-400 font-medium">
                    Errores encontrados ({result.errors.length}):
                  </p>
                </div>
                <ul className="text-sm text-red-600 dark:text-red-400 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              {result.errors.length > 0 && result.success > 0 && (
                <button
                  onClick={() => { setResult(null); setIsProcessing(false); }}
                  className="flex-1 px-4 py-2 bg-media-agua text-white rounded-lg hover:bg-media-agua-dark transition-colors"
                >
                  Importar otro archivo
                </button>
              )}
              <button
                onClick={onSuccess}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {result.success > 0 ? "Listo" : "Cerrar"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
