"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { RANKS, getRankProgress } from "@/lib/ranks";
import { formatNumber } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

interface ProgressCardProps {
  xp: number;
}

export function ProgressCard({ xp }: ProgressCardProps) {
  const p = getRankProgress(xp);

  return (
    <GlassCard variant="brand" pad="lg" className="text-brand-foreground">
      {/* Decorative depth */}
      <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full bg-black/10 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-foreground/60">
              Твой уровень
            </p>
            <h3 className="mt-1 text-2xl font-extrabold tracking-tight">
              {p.current.title}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1.5">
            <Zap className="size-4 fill-current" />
            <span className="text-sm font-bold">{formatNumber(xp)} XP</span>
          </div>
        </div>

        <p className="mt-1 text-sm font-medium text-brand-foreground/70">
          {p.current.tagline}
        </p>

        <div className="mt-5">
          <XPProgress value={p.ratio} size="lg" onBrand />
          <div className="mt-2 flex items-center justify-between text-xs font-semibold">
            {p.next ? (
              <>
                <span className="text-brand-foreground/70">
                  До «{p.next.title}»
                </span>
                <span>{formatNumber(p.xpToNext)} XP</span>
              </>
            ) : (
              <span className="text-brand-foreground/70">
                Максимальный уровень достигнут
              </span>
            )}
          </div>
        </div>

        {/* Career ladder pips */}
        <div className="mt-5 flex items-center gap-1.5">
          {RANKS.map((rank, i) => {
            const reached = i <= p.levelIndex;
            return (
              <motion.div
                key={rank.id}
                variants={fadeUp}
                className="flex-1"
                title={rank.title}
              >
                <div
                  className={
                    "h-1.5 rounded-full transition-colors " +
                    (reached ? "bg-brand-foreground" : "bg-black/15")
                  }
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}
