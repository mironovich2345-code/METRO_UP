"use client";

import { Lock } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { resolveIcon } from "@/lib/icons";
import type { Course } from "@/content";

export function LockedCourseCard({ course }: { course: Course }) {
  const Icon = resolveIcon(course.icon);

  return (
    <GlassCard
      variant="solid"
      pad="md"
      animateIn={false}
      className="flex h-full flex-col opacity-70"
    >
      <div className="flex items-start justify-between">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-3.5" />
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-bold leading-snug text-foreground">
        {course.title}
      </h3>

      <p className="mt-auto pt-4 text-xs font-medium text-muted-foreground">
        {course.plannedLessons} уроков · скоро
      </p>
    </GlassCard>
  );
}
