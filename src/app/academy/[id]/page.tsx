"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ClipboardCheck, Clock, Lock, Play } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADVANCED_LOCK_REASON,
  type ContentState,
  courseBySlug,
  dayLessonViews,
  dayProgress,
  findDay,
  STATE_LABELS,
} from "@/content";
import { resolveIcon } from "@/lib/icons";
import { cardIn, springSoft, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";

const isDone = (s: ContentState) =>
  s === "completed" || s === "awaiting_approval";
const isActive = (s: ContentState) =>
  s === "available" || s === "awaiting_attestation";

function StateIcon({ state }: { state: ContentState }) {
  if (isDone(state)) return <Check className="size-5" strokeWidth={3} />;
  if (state === "awaiting_attestation")
    return <ClipboardCheck className="size-5" />;
  if (state === "available")
    return <Play className="size-5 translate-x-[1px] fill-current" />;
  return <Lock className="size-4" />;
}

export default function CourseDetailScreen() {
  const params = useParams<{ id: string }>();
  const day = findDay(params.id);

  // Not a base-adaptation day: either a locked advanced track or unknown.
  if (!day) {
    const course = courseBySlug(params.id);
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppHeader showBack title={course?.title ?? "Раздел недоступен"} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Lock className="size-6" />
          </div>
          <p className="text-muted-foreground">
            {course ? ADVANCED_LOCK_REASON : "Этот раздел ещё не опубликован."}
          </p>
          <Button onClick={() => history.back()} size="md">
            Назад к Академии
          </Button>
        </div>
      </div>
    );
  }

  const Icon = resolveIcon(day.icon);
  const { completed, total, ratio } = dayProgress(day);
  const views = dayLessonViews(day);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader showBack title={day.title} showThemeSwitcher={false} />

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
              <div className="flex size-16 items-center justify-center rounded-3xl bg-brand/12">
                <Icon className="size-8 text-foreground" />
              </div>
              <div className="flex-1">
                <Badge variant="neutral" size="sm">
                  {day.subtitle}
                </Badge>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  <Clock className="size-3.5" />~{day.estimatedMinutes} мин ·{" "}
                  {completed} из {total} уроков
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
          {views.map(({ lesson, state }) => {
            const active = isActive(state);
            const done = isDone(state);
            const locked = state === "locked";
            return (
              <motion.button
                key={lesson.id}
                type="button"
                disabled={locked}
                whileTap={!locked ? { scale: 0.98 } : undefined}
                transition={springSoft}
                onClick={() => haptic("medium")}
                className={cn(
                  "flex items-center gap-4 rounded-3xl border p-4 text-left transition-colors",
                  active ? "border-brand bg-brand/8" : "border-border bg-card",
                  locked && "opacity-55",
                )}
              >
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    done && "bg-success text-white",
                    active && "bg-brand text-brand-foreground",
                    locked && "bg-muted text-muted-foreground",
                  )}
                >
                  <StateIcon state={state} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-foreground">
                    {lesson.title}
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {STATE_LABELS[state]} · {lesson.durationMinutes} мин
                  </p>
                </div>

                {!locked && (
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold text-brand">
                    +{lesson.xpReward} XP
                  </span>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
