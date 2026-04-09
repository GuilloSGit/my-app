"use client";

import { motion } from "framer-motion";

interface CalendarLogoProps {
  className?: string;
}

export function CalendarLogo({ className = "" }: CalendarLogoProps) {
  const days = [
    { color: "bg-rose-400", delay: 0 },
    { color: "bg-amber-400", delay: 0.1 },
    { color: "bg-emerald-400", delay: 0.2 },
    { color: "bg-sky-400", delay: 0.3 },
    { color: "bg-violet-400", delay: 0.4 },
    { color: "bg-media-agua", delay: 0.5 },
  ];

  return (
    <motion.svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Calendar frame */}
      <rect
        x="4"
        y="8"
        width="56"
        height="52"
        rx="6"
        className="fill-white dark:fill-zinc-900 stroke-slate-300 dark:stroke-zinc-700"
        strokeWidth="2"
      />
      
      {/* Header bar */}
      <rect
        x="4"
        y="8"
        width="56"
        height="14"
        rx="6"
        className="fill-media-agua"
      />
      <rect
        x="4"
        y="16"
        width="56"
        height="10"
        className="fill-media-agua"
      />
      
      {/* Rings */}
      <circle cx="18" cy="6" r="3" className="fill-slate-400 dark:fill-zinc-600" />
      <circle cx="46" cy="6" r="3" className="fill-slate-400 dark:fill-zinc-600" />
      
      {/* Colored days */}
      {days.map((day, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        return (
          <motion.rect
            key={i}
            x={10 + col * 18}
            y={30 + row * 16}
            width="14"
            height="10"
            rx="2"
            className={day.color}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: day.delay, duration: 0.3 }}
          />
        );
      })}
    </motion.svg>
  );
}
