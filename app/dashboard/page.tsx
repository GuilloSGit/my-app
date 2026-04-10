"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getUpcomingMeetings, Meeting } from "@/lib/meetings";
import { MeetingCard } from "@/components/meeting-card";
import { MeetingForm } from "@/components/meeting-form";
import { CsvImport } from "@/components/csv-import";
import { ZoomImportDialog } from "@/components/zoom-import-dialog";
import { ParsedZoomMeeting } from "@/lib/zoom-parser";
import { CalendarDays, Plus, Upload, Shield, RefreshCw, MessageSquare } from "lucide-react";
import { Tooltip } from "@/components/tooltip";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

function DashboardContent() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showZoomImport, setShowZoomImport] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [zoomData, setZoomData] = useState<Partial<ParsedZoomMeeting> | null>(null);
  
  const userIsAdmin = isAdmin(user);
  const userName = (() => {
    switch (user?.email) {
      case "guillermo@hermanosgonzalez.com":
        return "Guillermo";
      case "emilioeduardo933@gmail.com":
        return "Emilio";
      case "leootarola.321@gmail.com":
        return "Leo";
      case "lg9536590@gmail.com":
        return "Leandro";
      default:
        return "Usuario";
    }
  })();

  // Recargar reuniones
  const refreshMeetings = useCallback(async () => {
    const meetings = await getUpcomingMeetings();
    setMeetings(meetings);
    setRefreshKey(prev => prev + 1);
  }, []);

  // Cargar reuniones iniciales
  useState(() => {
    refreshMeetings();
  });

  const handleEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setShowForm(true);
  };

  const handleSave = async () => {
    setShowForm(false);
    setEditingMeeting(null);
    await refreshMeetings();
  };

  const handleImportSuccess = () => {
    setShowImport(false);
    refreshMeetings();
  };

  const handleZoomParsed = (data: Partial<ParsedZoomMeeting>) => {
    setZoomData(data);
    setShowZoomImport(false);
    setShowForm(true);
  };

  return (
    <main className="min-h-screen pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-media-agua">
              <CalendarDays className="w-5 h-5" />
              <span className="text-sm font-medium uppercase tracking-wider">
                Próximas Reuniones
              </span>
            </div>
            {userIsAdmin && (
              <div className="flex items-center gap-2 px-3 py-1 bg-media-agua/10 text-media-agua rounded-full text-xs font-medium">
                <Shield className="w-3 h-3" />
                Admin
              </div>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-zinc-100">
            Hola{" "}
            <span className="capitalize">{userName}</span>,
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 mt-2 text-lg">
            aquí tienes los detalles para las reuniones programadas.
          </p>
        </motion.div>

        {/* Admin Actions */}
        {userIsAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8 p-4 bg-gradient-to-r from-media-agua/5 to-media-agua/10 rounded-xl border border-media-agua/20"
          >
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-3">
              Panel de Administración:
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-media-agua text-white text-sm font-medium rounded-lg hover:bg-media-agua-dark transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nueva Reunión
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-sm font-medium rounded-lg border border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Importar CSV
              </button>
              <button
                onClick={() => setShowZoomImport(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Pegar desde Zoom
              </button>
              <button
                onClick={refreshMeetings}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar
              </button>
            </div>
          </motion.div>
        )}

        {/* Meetings List */}
        {meetings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center py-16 bg-white dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800"
          >
            <CalendarDays className="w-16 h-16 text-slate-300 dark:text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 mb-2">
              No hay reuniones programadas
            </h2>
            <p className="text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
              {userIsAdmin 
                ? "Agrega reuniones usando el panel de administración arriba."
                : "En este momento no hay reuniones próximas. Contacta al administrador si necesitas información."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={refreshKey}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-6"
          >
            {meetings.map((meeting) => (
              <motion.div key={meeting.id} variants={itemVariants}>
                <MeetingCard 
                  meeting={meeting} 
                  isAdmin={userIsAdmin}
                  onEdit={() => handleEdit(meeting)}
                  onDelete={refreshMeetings}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Info footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 p-4 bg-slate-50 dark:bg-zinc-900/30 rounded-xl border border-slate-200 dark:border-zinc-800"
        >
          <p className="text-sm text-slate-500 dark:text-zinc-400 text-center">
            Las reuniones pasadas se eliminan automáticamente. Si necesitas los datos de una reunión anterior,{" "}
            <Tooltip
              content={
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold mb-1">Teléfono:</p>
                    <a href="tel:+543876295801" className="hover:underline text-blue-400 dark:text-blue-300">
                      +54 387 629 5801
                    </a>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">WhatsApp:</p>
                    <a
                      href="https://wa.me/543876295801?text=Necesito%20datos%20de%20una%20reunión%20anterior"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-blue-400 dark:text-blue-300"
                    >
                      +54 387 629 5801
                    </a>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Email:</p>
                    <a href="mailto:guillermoandrada@gmail.com" className="hover:underline text-blue-400 dark:text-blue-300">
                      guillermoandrada@gmail.com
                    </a>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Sitio Web:</p>
                    <a
                      href="https://GA-Software.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-blue-400 dark:text-blue-300"
                    >
                      GA-Software.dev
                    </a>
                  </div>
                </div>
              }
            >
              <span className="cursor-pointer border-b border-dotted border-slate-400 dark:border-zinc-600 hover:border-solid">
                contacta al administrador
              </span>
            </Tooltip>
            .
          </p>
        </motion.div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showForm && (
          <MeetingForm
            meeting={editingMeeting || undefined}
            zoomData={zoomData || undefined}
            onSave={() => {
              handleSave();
              setZoomData(null);
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingMeeting(null);
              setZoomData(null);
            }}
          />
        )}
        {showImport && (
          <CsvImport
            onSuccess={handleImportSuccess}
            onCancel={() => setShowImport(false)}
          />
        )}
        {showZoomImport && (
          <ZoomImportDialog
            onParsed={handleZoomParsed}
            onCancel={() => setShowZoomImport(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <Navbar />
      <DashboardContent />
    </AuthGuard>
  );
}
