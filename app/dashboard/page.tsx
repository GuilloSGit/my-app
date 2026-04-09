"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/lib/auth";
import { getUpcomingMeetings, formatMeetingDate, Meeting } from "@/lib/meetings";
import { MeetingCard } from "@/components/meeting-card";
import { CalendarDays, User } from "lucide-react";

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
  const meetings = getUpcomingMeetings();
  const userName = user?.email?.split("@")[0] || "hermano";

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
          <div className="flex items-center gap-2 text-media-agua mb-2">
            <CalendarDays className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">
              Próximas Reuniones
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-zinc-100">
            Hola{" "}
            <span className="capitalize">{userName}</span>,
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 mt-2 text-lg">
            aquí tienes los detalles para las reuniones programadas.
          </p>
        </motion.div>

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
              En este momento no hay reuniones próximas. Contacta al administrador si necesitas información.
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-6"
          >
            {meetings.map((meeting) => (
              <motion.div key={meeting.id} variants={itemVariants}>
                <MeetingCard meeting={meeting} />
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
            Las reuniones pasadas se eliminan automáticamente. Si necesitas los datos de una reunión anterior, contacta al administrador.
          </p>
        </motion.div>
      </div>
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
