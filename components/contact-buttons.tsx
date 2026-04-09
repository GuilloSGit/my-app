"use client";

import { motion } from "framer-motion";
import { MessageCircle, Video, Mail } from "lucide-react";

const contactInfo = [
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "+54 387 629 5801",
    href: "https://wa.me/543876295801",
    color: "hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400",
  },
  {
    icon: Video,
    label: "Google Meet",
    value: "Agendar reunión",
    href: "https://calendar.app.google/BrFnLdX8Xudn4WVD7",
    color: "hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400",
  },
  {
    icon: Mail,
    label: "Email",
    value: "guillermoandrada@gmail.com",
    href: "mailto:guillermoandrada@gmail.com",
    color: "hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400",
  },
];

export function ContactButtons() {
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {contactInfo.map((contact, index) => (
        <motion.a
          key={contact.label}
          href={contact.href}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: index * 0.1, duration: 0.4 }}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className={`group flex flex-col items-center p-6 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-all ${contact.color} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-media-agua`}
        >
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-700 flex items-center justify-center mb-3 transition-colors group-hover:bg-current/10">
            <contact.icon className="w-6 h-6 text-slate-600 dark:text-zinc-400 transition-colors group-hover:text-current" />
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-zinc-500 mb-1">
            {contact.label}
          </span>
          <span className="text-slate-900 dark:text-zinc-100 font-medium text-center break-all">
            {contact.value.split("@")[0]}<br />
            {contact.value.split("@")[1]}
          </span>
        </motion.a>
      ))}
    </div>
  );
}
