"use client";

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { getCareerProgress } from "@/domain/career";

/**
 * Home career card: current in-app level, progress toward the next level, and
 * the next level's name. Career is requirement-based (never XP-driven). For a
 * newcomer the bar reflects базовая адаптация — the active gate to «Менеджер».
 */
export function CareerCard({ adaptationRatio }: { adaptationRatio: number }) {
  const progress = useMemo(() => getCareerProgress(), []);
  const { currentLevel, nextLevel } = progress;

  const ratio =
    currentLevel.id === "NEWCOMER" ? adaptationRatio : progress.ratio;
  const pct = Math.round(ratio * 100);

  return (
    <GlassCard variant="brand" pad="lg" className="text-brand-foreground">
      <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full bg-black/10 blur-2xl" />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-foreground/60">
          Твой уровень
        </p>
        <h3 className="mt-1 text-2xl font-extrabold tracking-tight">
          {currentLevel.title}
        </h3>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="text-brand-foreground/80">
              {currentLevel.id === "NEWCOMER"
                ? "Базовая адаптация"
                : "Прогресс уровня"}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-2">
            <XPProgress value={ratio} size="lg" onBrand />
          </div>
          {nextLevel && (
            <p className="mt-3 text-xs font-medium text-brand-foreground/70">
              Следующий уровень:{" "}
              <span className="font-bold text-brand-foreground">
                {nextLevel.title}
              </span>
            </p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
