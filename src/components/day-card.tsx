"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { Badge } from "@/components/ui/badge";
import { resolveIcon } from "@/lib/icons";
import { haptic } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { dayProgress, type TrainingDay } from "@/content";

export function DayCard({ day }: { day: TrainingDay }) {
  const router = useRouter();
  const Icon = resolveIcon(day.icon);
  const { completed, total, ratio, state } = dayProgress(day);
  const done = state === "completed";

  return (
    <GlassCard
      variant="solid"
      pad="md"
      interactive
      onClick={() => {
        haptic("medium");
        router.push(`/academy/${day.slug}`);
      }}
      className="flex h-full flex-col"
    >
      <div className="flex items-start justify-between">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/12">
          <Icon className="size-6 text-foreground" />
        </div>
        {done ? (
          <Badge variant="success" size="sm">
            <CheckCircle2 className="size-3" />
            Готово
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm">
            {day.subtitle}
          </Badge>
        )}
      </div>

      <h3 className="mt-4 text-[15px] font-bold leading-snug text-foreground">
        {day.title}
      </h3>
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Clock className="size-3" />~{day.estimatedMinutes} мин
      </p>

      <div className="mt-auto pt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            {completed}/{total} уроков
          </span>
          <span className={cn(done && "text-success")}>
            {Math.round(ratio * 100)}%
          </span>
        </div>
        <XPProgress value={ratio} size="sm" glow={false} />
      </div>
    </GlassCard>
  );
}
