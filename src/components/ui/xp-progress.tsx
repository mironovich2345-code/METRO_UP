"use client";

import { motion } from "framer-motion";
import { cn, clamp } from "@/lib/utils";
import { easeOutSoft } from "@/lib/motion";

interface XPProgressProps {
  /** Progress ratio, 0..1. */
  value: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Render the bar on a dark/brand surface (inverts the track). */
  onBrand?: boolean;
  /** Animate a soft moving highlight along the fill. */
  glow?: boolean;
}

const heights = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

export function XPProgress({
  value,
  className,
  size = "md",
  onBrand,
  glow = true,
}: XPProgressProps) {
  const ratio = clamp(value, 0, 1);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        heights[size],
        onBrand ? "bg-black/15" : "bg-muted",
        className,
      )}
    >
      <motion.div
        className={cn(
          "relative h-full rounded-full",
          onBrand
            ? "bg-brand-foreground"
            : "bg-gradient-to-r from-brand-strong to-brand",
        )}
        initial={{ width: 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 0.9, ease: easeOutSoft }}
      >
        {glow && ratio > 0.04 && (
          <motion.span
            className="absolute inset-y-0 right-0 w-8 rounded-full bg-white/40 blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.div>
    </div>
  );
}
