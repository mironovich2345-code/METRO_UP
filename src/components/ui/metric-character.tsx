"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MetricCharacterProps {
  size?: number;
  className?: string;
  /** Idle float + blink animation. */
  animated?: boolean;
  /** Mood tweaks the eyes/accent for context. */
  mood?: "focused" | "happy" | "cheer";
}

/**
 * Metric — the MetroFitness companion.
 * A minimal geometric token: a soft-cornered dark body, a yellow energy spark,
 * and two calm eyes. Deliberately not cartoonish — it reads as a premium mark.
 */
export function MetricCharacter({
  size = 96,
  className,
  animated = true,
  mood = "focused",
}: MetricCharacterProps) {
  const eyeGap = mood === "cheer" ? 26 : 24;

  return (
    <motion.div
      className={cn("relative", className)}
      style={{ width: size, height: size }}
      animate={animated ? { y: [0, -6, 0] } : undefined}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Soft aura */}
      <div
        className="absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-2xl"
        style={{
          width: size * 0.9,
          height: size * 0.9,
          background:
            "radial-gradient(circle, var(--brand) 0%, transparent 70%)",
          opacity: 0.35,
        }}
      />

      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        role="img"
        aria-label="Метрик"
      >
        <defs>
          <linearGradient id="metric-body" x1="20" y1="12" x2="80" y2="90">
            <stop offset="0%" stopColor="#1c1c22" />
            <stop offset="100%" stopColor="#0a0a0c" />
          </linearGradient>
          <linearGradient id="metric-spark" x1="50" y1="4" x2="50" y2="30">
            <stop offset="0%" stopColor="var(--brand-strong)" />
            <stop offset="100%" stopColor="var(--brand)" />
          </linearGradient>
        </defs>

        {/* Energy spark / antenna */}
        <motion.path
          d="M50 6 L58 22 L50 20 L44 30 L47 20 L40 20 Z"
          fill="url(#metric-spark)"
          animate={
            animated
              ? { rotate: [-6, 6, -6], y: [0, -1.5, 0] }
              : undefined
          }
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "50px 26px" }}
        />

        {/* Body — a calm superellipse token */}
        <rect
          x="18"
          y="26"
          width="64"
          height="60"
          rx="24"
          fill="url(#metric-body)"
          stroke="var(--brand)"
          strokeOpacity="0.14"
          strokeWidth="1.5"
        />

        {/* Cheek glow */}
        <circle cx="34" cy="66" r="6" fill="var(--brand)" opacity="0.14" />
        <circle cx="66" cy="66" r="6" fill="var(--brand)" opacity="0.14" />

        {/* Eyes */}
        {[50 - eyeGap / 2, 50 + eyeGap / 2].map((cx, i) => (
          <motion.rect
            key={i}
            x={cx - 4}
            y="48"
            width="8"
            height="16"
            rx="4"
            fill="var(--brand)"
            animate={
              animated
                ? { scaleY: [1, 1, 0.12, 1], y: [0, 0, 6, 0] }
                : undefined
            }
            transition={{
              duration: 4.5,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.85, 0.9, 1],
              delay: i * 0.04,
            }}
            style={{ transformOrigin: `${cx}px 56px` }}
          />
        ))}

        {/* Subtle smile for happier moods */}
        {mood !== "focused" && (
          <path
            d="M42 74 Q50 80 58 74"
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
        )}
      </svg>
    </motion.div>
  );
}
