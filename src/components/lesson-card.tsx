"use client";

import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { haptic } from "@/lib/telegram";

interface LessonCardProps {
  courseTitle: string;
  lessonTitle: string;
  icon: LucideIcon;
  /** 0..1 course progress. */
  progress: number;
  href?: string;
}

/** The "continue learning" resume card. */
export function LessonCard({
  courseTitle,
  lessonTitle,
  icon: Icon,
  progress,
  href = "/academy",
}: LessonCardProps) {
  const router = useRouter();
  const percent = Math.round(progress * 100);

  return (
    <GlassCard
      variant="solid"
      pad="md"
      interactive
      onClick={() => {
        haptic("medium");
        router.push(href);
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
          <Icon className="size-6 text-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {courseTitle}
          </p>
          <p className="truncate text-[15px] font-bold text-foreground">
            {lessonTitle}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <XPProgress value={progress} size="sm" glow={false} />
            <span className="text-xs font-semibold text-muted-foreground">
              {percent}%
            </span>
          </div>
        </div>

        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[var(--shadow-brand)]">
          <Play className="size-5 translate-x-[1px] fill-current" />
        </div>
      </div>
    </GlassCard>
  );
}
