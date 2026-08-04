"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/lib/data";
import type { Course } from "@/lib/types";
import { haptic } from "@/lib/telegram";
import { cn } from "@/lib/utils";

export function CourseCard({ course }: { course: Course }) {
  const router = useRouter();
  const Icon = course.icon;
  const ratio = course.completedLessons / course.totalLessons;
  const done = course.completedLessons >= course.totalLessons;

  return (
    <GlassCard
      variant="solid"
      pad="md"
      interactive
      onClick={() => {
        haptic("medium");
        router.push(`/academy/${course.id}`);
      }}
      className="flex h-full flex-col"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex size-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${course.accent}22` }}
        >
          <Icon className="size-6" style={{ color: course.accent }} />
        </div>
        {done ? (
          <Badge variant="success" size="sm">
            <CheckCircle2 className="size-3" />
            Готово
          </Badge>
        ) : (
          <Badge variant="neutral" size="sm">
            {CATEGORY_LABELS[course.category]}
          </Badge>
        )}
      </div>

      <h3 className="mt-4 text-[15px] font-bold leading-snug text-foreground">
        {course.title}
      </h3>

      <div className="mt-auto pt-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>
            {course.completedLessons}/{course.totalLessons} уроков
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
