"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Lock, PlayCircle, Star } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { cardIn, staggerStack, springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { ApiError } from "@/lib/api/client";
import { fetchAcademyDay } from "@/lib/api/content-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import type { AcademyLessonRowDTO } from "@/lib/api/content-types";

/**
 * Training-day detail — real Courses/Lessons from PostgreSQL (PUBLISHED only),
 * gated server-side. Tapping an available lesson opens the DB lesson player.
 */
export default function DayScreen() {
  const { id } = useParams<{ id: string }>();
  const fetchDay = useCallback(() => fetchAcademyDay(id), [id]);
  const { data: day, error, isLoading, isValidating, mutate } = useQuery(
    cacheKeys.academyDay(id),
    fetchDay,
    // MEDIUM, not LONG: the response mixes published structure (rarely
    // changes) with THIS user's own completed/locked state per lesson — the
    // same "changes from the user's own actions" reasoning as Academy
    // overview, and academy:* is force-invalidated on every lesson/quiz
    // completion regardless of this window (see LessonRenderer/QuizFlow).
    QUERY_POLICY.MEDIUM,
  );
  const status: "loading" | "ready" | "notfound" | "error" =
    error instanceof ApiError && error.status === 404
      ? "notfound"
      : error
        ? "error"
        : !day && isLoading
          ? "loading"
          : day
            ? "ready"
            : "loading";

  const lessonCount = day?.courses.reduce((s, c) => s + c.lessons.length, 0) ?? 0;

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader
        title={day ? `День ${day.dayNumber}` : "День"}
        subtitle={day?.title}
        showBack
        backHref="/academy"
        showThemeSwitcher={false}
      />
      <RevalidatingBar show={Boolean(day) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && (
          <div className="space-y-3">
            <div className="h-20 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {status === "notfound" && (
          <p className="mt-16 text-center text-muted-foreground">День не найден</p>
        )}

        {status === "error" && (
          <div className="mt-16 text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>Повторить</Button>
          </div>
        )}

        {status === "ready" && day && (
          <>
            {day.description && (
              <motion.p variants={cardIn} className="mb-4 text-[15px] text-muted-foreground">
                {day.description}
              </motion.p>
            )}

            {lessonCount === 0 ? (
              <motion.div variants={cardIn}>
                <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
                  <p className="font-semibold">В этом дне пока нет уроков</p>
                  <p className="mt-1 text-sm text-muted-foreground">Здесь скоро появятся уроки</p>
                </GlassCard>
              </motion.div>
            ) : (
              day.courses.map((course) => (
                <div key={course.id} className="mb-6">
                  <motion.div variants={cardIn}>
                    <SectionHeader title={course.title} />
                  </motion.div>
                  <div className="mt-3 space-y-2">
                    {course.lessons.map((lesson) => (
                      <motion.div key={lesson.id} variants={cardIn}>
                        <LessonRow lesson={lesson} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </motion.main>
    </div>
  );
}

function LessonRow({ lesson }: { lesson: AcademyLessonRowDTO }) {
  const router = useRouter();
  const open = () => {
    if (lesson.locked) return;
    haptic("medium");
    router.push(`/academy/lesson/${lesson.slug}`);
  };
  return (
    <motion.button
      type="button"
      onClick={open}
      whileTap={lesson.locked ? undefined : { scale: 0.98 }}
      transition={springSoft}
      disabled={lesson.locked}
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl border p-4 text-left transition-colors",
        lesson.completed
          ? "border-success/40 bg-success-soft/40"
          : lesson.locked
            ? "border-border bg-card opacity-60"
            : "border-brand bg-brand/8",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl",
          lesson.completed ? "bg-success text-white" : lesson.locked ? "bg-muted text-muted-foreground" : "bg-brand/15 text-brand",
        )}
      >
        {lesson.completed ? <CheckCircle2 className="size-5" /> : lesson.locked ? <Lock className="size-4" /> : <PlayCircle className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{lesson.title}</p>
        {lesson.shortDescription && (
          <p className="truncate text-sm text-muted-foreground">{lesson.shortDescription}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="size-3" /> {lesson.durationMinutes} мин</span>
          {lesson.xpReward > 0 && (
            <span className="flex items-center gap-1 text-brand"><Star className="size-3" /> +{lesson.xpReward} XP</span>
          )}
          {!lesson.isRequired && <Badge variant="outline" size="sm">необяз.</Badge>}
        </div>
      </div>
    </motion.button>
  );
}
