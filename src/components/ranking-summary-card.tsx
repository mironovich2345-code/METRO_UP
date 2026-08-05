"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatNumber } from "@/lib/utils";
import { RANKING, RANKING_TOTAL, RANKING_WEEKLY_CHANGE } from "@/lib/data";
import { haptic } from "@/lib/telegram";
import type { RankingEntry } from "@/lib/types";

function NearRow({
  entry,
  highlight,
}: {
  entry: RankingEntry;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
        highlight && "bg-brand/10",
      )}
    >
      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {entry.position}
      </span>
      <Avatar name={entry.name} size={28} ring={highlight} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {entry.name}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">
        {formatNumber(entry.xp)} XP
      </span>
    </div>
  );
}

/**
 * Compact ranking summary for the Home screen: current place, network size,
 * weekly change, gap to the next place, and the two nearest participants.
 * Height is content-driven (no empty filler). Tapping opens the full /ranking.
 */
export function RankingSummaryCard() {
  const me = RANKING.find((r) => r.isCurrentUser);
  if (!me) return null;

  const ahead = RANKING.find((r) => r.position === me.position - 1);
  const gapXp = ahead ? ahead.xp - me.xp : 0;
  const change = RANKING_WEEKLY_CHANGE;
  const up = change >= 0;

  return (
    <Link href="/ranking" className="block" onClick={() => haptic("light")}>
      <GlassCard variant="solid" pad="md" interactive animateIn={false}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold leading-none text-foreground">
              {me.position}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              из {formatNumber(RANKING_TOTAL)}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
              up
                ? "bg-emerald-500/12 text-emerald-500"
                : "bg-red-500/12 text-red-500",
            )}
          >
            {up ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {up ? `+${change}` : change} за неделю
          </span>
        </div>

        {ahead ? (
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">
            Ещё{" "}
            <span className="font-bold text-foreground">
              {formatNumber(gapXp)} XP
            </span>{" "}
            до {ahead.position} места
          </p>
        ) : (
          <p className="mt-1.5 text-sm font-bold text-foreground">
            Ты возглавляешь сеть 🏆
          </p>
        )}

        <div className="mt-3 flex flex-col gap-1">
          {ahead && <NearRow entry={ahead} />}
          <NearRow entry={me} highlight />
        </div>
      </GlassCard>
    </Link>
  );
}
