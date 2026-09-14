"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { buildOccurrenceShareMessage, Occurrence } from "@/lib/automation";

interface OccurrenceWhatsAppShareProps {
  occurrence: Occurrence;
}

export function OccurrenceWhatsAppShare({ occurrence }: OccurrenceWhatsAppShareProps) {
  const handleShare = () => {
    const message = buildOccurrenceShareMessage(occurrence);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <motion.button
      onClick={handleShare}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
      aria-label="Compartir por WhatsApp"
    >
      <MessageCircle className="w-4 h-4" />
      <span>WhatsApp</span>
    </motion.button>
  );
}
