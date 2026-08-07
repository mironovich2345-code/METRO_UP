"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { getPublishedBoard } from "@/domain/rating";
import { haptic } from "@/lib/telegram";
import { cn } from "@/lib/utils";

/** Home card: the employee's place in LAST month's published rating. */
export function RatingPlaceCard() {
  const board = useMemo(() => getPublishedBoard(), []);
  const me = board?.currentUser ?? null;

  if (!board || !me) {
    return (
      <GlassCard variant="solid" pad="lg" animateIn={false}>
        <p className="text-sm font-medium text-muted-foreground">
          Рейтинг за прошлый месяц ещё не опубликован.
        </p>
      </GlassCard>
    );
  }

  const up = (me.delta ?? 0) >= 0;

  return (
    <Link href="/ranking" className="block" onClick={() => haptic("light")}>
      <GlassCard variant="solid" pad="lg" interactive animateIn={false}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-brand/15">
              <Trophy className="size-5 text-brand" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Рейтинг · {board.label}
              </p>
              <p className="text-2xl font-extrabold leading-none text-foreground">
                {me.rank} место
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="whitespace-nowrap text-sm font-bold text-foreground">
              {me.finalScore.toFixed(1)} балла
            </span>
            {me.delta !== null && me.delta !== 0 && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-bold",
                  up ? "text-emerald-500" : "text-red-500",
                )}
              >
                {up ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {up ? `+${me.delta}` : me.delta}
              </span>
            )}
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
