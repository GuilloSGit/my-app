"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Meeting, formatMeetingDate } from "@/lib/meetings";
import { MessageCircle, Send, X, Edit3 } from "lucide-react";

interface WhatsAppShareProps {
  meeting: Meeting;
  expanded?: boolean;
}

export function WhatsAppShare({ meeting, expanded = false }: WhatsAppShareProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [message, setMessage] = useState(() => generateDefaultMessage(meeting));

  const handleShare = () => {
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  if (!expanded) {
    return (
      <motion.button
        onClick={() => setShowEditor(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      >
        <MessageCircle className="w-4 h-4" />
        Compartir por WhatsApp
      </motion.button>
    );
  }

  return (
    <div className="space-y-3">
      {!showEditor ? (
        <div className="flex gap-3">
          <motion.button
            onClick={handleShare}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            Enviar
          </motion.button>
          <motion.button
            onClick={() => setShowEditor(true)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-800 border border-green-500 text-green-600 dark:text-green-400 font-medium rounded-lg hover:bg-green-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            Personalizar mensaje y compartir
          </motion.button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-3"
        >
          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full p-4 pr-10 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Escribe tu mensaje..."
            />
            <button
              onClick={() => setShowEditor(false)}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex gap-3">
            <motion.button
              onClick={handleShare}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              Enviar por WhatsApp
            </motion.button>
            <motion.button
              onClick={() => setMessage(generateDefaultMessage(meeting))}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-3 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-medium rounded-lg transition-colors"
            >
              Restaurar
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function generateDefaultMessage(meeting: Meeting): string {
  const date = formatMeetingDate(meeting.date);
  
  return `¡Hola!

Te comparto los datos para la reunión de la Congregación Media Agua:

-> *${meeting.title}*
-> ${date}

Link: ${meeting.zoomLink}
ID: ${meeting.zoomId}
Contraseña: ${meeting.passcode}

¡Te esperamos!`;
}
