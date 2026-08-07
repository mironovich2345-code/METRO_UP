"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";

/** Home level card for a новичок: adaptation-focused, not XP-focused. */
export function NewcomerCard({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);

  return (
    <GlassCard variant="brand" pad="lg" className="text-brand-foreground">
      <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 size-40 rounded-full bg-black/10 blur-2xl" />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-foreground/60">
          Твой путь начинается
        </p>
        <h3 className="mt-1 text-2xl font-extrabold tracking-tight">Новичок</h3>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="text-brand-foreground/80">Базовая адаптация</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-2">
            <XPProgress value={ratio} size="lg" onBrand />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
