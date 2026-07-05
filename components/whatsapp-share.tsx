"use client";

import { motion } from "framer-motion";
import { Meeting, formatMeetingDate } from "@/lib/meetings";
import { MessageCircle, Send } from "lucide-react";

interface WhatsAppShareProps {
  meeting: Meeting;
  expanded?: boolean;
}

export function WhatsAppShare({ meeting, expanded = false }: WhatsAppShareProps) {
  const handleShare = () => {
    const message = generateDefaultMessage(meeting);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  if (!expanded) {
    return (
      <motion.button
        onClick={(e) => {
          // Sin esto, el click burbujea al header de la card y togglea el
          // expand/collapse en vez de solo compartir.
          e.stopPropagation();
          handleShare();
        }}
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
    <motion.button
      onClick={handleShare}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
    >
      <Send className="w-4 h-4" />
      Enviar
    </motion.button>
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
