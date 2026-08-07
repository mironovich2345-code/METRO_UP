"use client";

import { useMemo } from "react";
import { Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { getXPBalance, XP_REASON_META } from "@/domain/xp";
import { resolveIcon } from "@/lib/icons";
import { cn, formatNumber } from "@/lib/utils";

/** Home XP card: total XP, XP earned today, and the latest transactions. */
export function XPCard({ employeeId }: { employeeId: string }) {
  const balance = useMemo(() => getXPBalance(employeeId), [employeeId]);

  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-brand/15">
            <Zap className="size-5 text-brand" fill="currentColor" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Общий XP</p>
            <p className="text-2xl font-extrabold leading-none text-foreground">
              {formatNumber(balance.total)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold",
            balance.today > 0
              ? "bg-brand/15 text-brand"
              : "bg-muted text-muted-foreground",
          )}
        >
          Сегодня +{formatNumber(balance.today)}
        </span>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Последние начисления
        </p>
        <ul className="flex flex-col gap-2">
          {balance.recent.slice(0, 3).map((t) => {
            const meta = XP_REASON_META[t.reason];
            const Icon = resolveIcon(meta.icon);
            return (
              <li key={t.id} className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-4 text-foreground" />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {meta.label}
                </span>
                <span className="shrink-0 whitespace-nowrap text-sm font-bold text-brand">
                  +{t.amount}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </GlassCard>
  );
}
