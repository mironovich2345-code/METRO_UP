"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Lock, Play } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, COURSES } from "@/lib/data";
import { cardIn, springSoft, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";

export default function CourseDetailScreen() {
  const params = useParams<{ id: string }>();
  const course = COURSES.find((c) => c.id === params.id);

  if (!course) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader showBack title="Курс не найден" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-muted-foreground">
            Похоже, этот курс ещё не опубликован.
          </p>
          <Button onClick={() => history.back()} size="md">
            Назад к Академии
          </Button>
        </div>
      </div>
    );
  }

  const Icon = course.icon;
  const ratio = course.completedLessons / course.totalLessons;

  const lessons = Array.from({ length: course.totalLessons }, (_, i) => {
    const status =
      i < course.completedLessons
        ? "done"
        : i === course.completedLessons
          ? "current"
          : "locked";
    return { index: i + 1, status } as const;
  });

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader showBack title={course.title} showThemeSwitcher={false} />

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 px-5"
      >
        {/* Hero */}
        <motion.div variants={cardIn}>
          <GlassCard variant="solid" pad="lg" animateIn={false}>
            <div className="flex items-center gap-4">
              <div
                className="flex size-16 items-center justify-center rounded-3xl"
                style={{ backgroundColor: `${course.accent}22` }}
              >
                <Icon className="size-8" style={{ color: course.accent }} />
              </div>
              <div className="flex-1">
                <Badge variant="neutral" size="sm">
                  {CATEGORY_LABELS[course.category]}
                </Badge>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {course.completedLessons} из {course.totalLessons} уроков
                  пройдено
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <XPProgress value={ratio} size="md" />
              <span className="text-sm font-bold text-foreground">
                {Math.round(ratio * 100)}%
              </span>
            </div>
          </GlassCard>
        </motion.div>

        {/* Lessons */}
        <motion.div variants={cardIn} className="flex flex-col gap-2.5">
          {lessons.map((lesson) => (
            <motion.button
              key={lesson.index}
              type="button"
              disabled={lesson.status === "locked"}
              whileTap={lesson.status !== "locked" ? { scale: 0.98 } : undefined}
              transition={springSoft}
              onClick={() => haptic("medium")}
              className={cn(
                "flex items-center gap-4 rounded-3xl border p-4 text-left transition-colors",
                lesson.status === "current"
                  ? "border-brand bg-brand/8"
                  : "border-border bg-card",
                lesson.status === "locked" && "opacity-55",
              )}
            >
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                  lesson.status === "done" && "bg-success text-white",
                  lesson.status === "current" &&
                    "bg-brand text-brand-foreground",
                  lesson.status === "locked" &&
                    "bg-muted text-muted-foreground",
                )}
              >
                {lesson.status === "done" && (
                  <Check className="size-5" strokeWidth={3} />
                )}
                {lesson.status === "current" && (
                  <Play className="size-5 translate-x-[1px] fill-current" />
                )}
                {lesson.status === "locked" && <Lock className="size-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-foreground">
                  Урок {lesson.index}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  {lesson.status === "done"
                    ? "Завершён"
                    : lesson.status === "current"
                      ? "Продолжить"
                      : "Откроется позже"}
                </p>
              </div>

              {lesson.status !== "locked" && (
                <span className="text-xs font-bold text-brand">+50 XP</span>
              )}
            </motion.button>
          ))}
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
