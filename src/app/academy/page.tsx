"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GraduationCap } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { CourseCard } from "@/components/course-card";
import { CATEGORY_LABELS, COURSES } from "@/lib/data";
import type { CourseCategory } from "@/lib/types";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/telegram";

type Filter = "all" | CourseCategory;

const FILTERS: Filter[] = ["all", "sales", "service", "product", "brand"];

export default function AcademyScreen() {
  const [filter, setFilter] = useState<Filter>("all");

  const totals = useMemo(() => {
    const done = COURSES.reduce((s, c) => s + c.completedLessons, 0);
    const total = COURSES.reduce((s, c) => s + c.totalLessons, 0);
    return { done, total, ratio: total ? done / total : 0 };
  }, []);

  const visible = useMemo(
    () =>
      filter === "all"
        ? COURSES
        : COURSES.filter((c) => c.category === filter),
    [filter],
  );

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Академия" subtitle="Твои курсы и прогресс" />

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="px-5"
      >
        {/* Overall progress */}
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="lg" animateIn={false}>
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/12">
                <GraduationCap className="size-7 text-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Общий прогресс
                </p>
                <p className="text-2xl font-extrabold tracking-tight text-foreground">
                  {Math.round(totals.ratio * 100)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-foreground">
                  {totals.done}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  из {totals.total} уроков
                </p>
              </div>
            </div>
            <div className="mt-4">
              <XPProgress value={totals.ratio} size="md" />
            </div>
          </GlassCard>
        </motion.div>

        {/* Category filter */}
        <motion.div
          variants={cardIn}
          className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5"
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  hapticSelection();
                  setFilter(f);
                }}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {f === "all" ? "Все" : CATEGORY_LABELS[f]}
              </button>
            );
          })}
        </motion.div>

        {/* Course grid */}
        <motion.div
          key={filter}
          variants={staggerStack}
          initial="hidden"
          animate="show"
          className="mt-5 grid grid-cols-2 gap-3"
        >
          {visible.map((course) => (
            <motion.div key={course.id} variants={cardIn}>
              <CourseCard course={course} />
            </motion.div>
          ))}
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
