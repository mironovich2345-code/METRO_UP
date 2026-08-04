"use client";

import { GlassCard } from "@/components/ui/glass-card";
import type { Achievement } from "@/lib/types";
import { haptic } from "@/lib/telegram";

export function AchievementCard({ achievement }: { achievement: Achievement }) {
  const Icon = achievement.icon;
  return (
    <GlassCard
      variant="solid"
      pad="md"
      interactive
      onClick={() => haptic("light")}
      className="min-w-[168px] snap-start"
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/12">
        <Icon className="size-6 text-brand" />
      </div>
      <h3 className="mt-3 text-[15px] font-bold leading-snug text-foreground">
        {achievement.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {achievement.description}
      </p>
      <p className="mt-3 text-[11px] font-semibold text-brand">
        {achievement.earnedAt}
      </p>
    </GlassCard>
  );
}
