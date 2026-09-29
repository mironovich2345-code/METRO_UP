"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, GraduationCap } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import type { EmployeeTrainingDetailDTO, EmployeeTrainingLessonDTO } from "@/lib/api/cabinet-client";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sprint: manual-test-round-3, sections 5C/5D — one employee's detailed
 * training view. Reached from /team (both a real CLUB_MANAGER's own roster
 * and a CITY_MANAGER's read-only drill-down) — the SAME screen for both
 * roles, no parallel analytics system. Authorization is entirely server-side
 * (GET /api/control/cabinet/employee-training re-derives club.read against
 * the real actor's current grants) — this page never decides who may see
 * what, it only renders what the server returns or denies.
 */
export default function EmployeeTrainingPage() {
  const search = useSearchParams();
  const userId = search.get("userId");
  const clubId = search.get("clubId");

  const [data, setData] = useState<EmployeeTrainingDetailDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "denied">("loading");

  const load = useCallback(() => {
    if (!userId) return;
    setStatus("loading");
    cabinetApi
      .employeeTraining(userId)
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch((e) => setStatus(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "denied" : "error"));
  }, [userId]);
  useEffect(load, [load]);

  const backHref = clubId ? `/team?clubId=${clubId}` : "/team";

  if (!userId) {
    return (
      <div className="relative min-h-[100dvh] pb-24">
        <AppHeader title="Сотрудник" showBack backHref={backHref} showThemeSwitcher={false} />
        <div className="px-5 pt-6">
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Сотрудник не указан</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  const ratio = data && data.overall.total > 0 ? data.overall.completed / data.overall.total : 0;

  return (
    <div className="relative min-h-[100dvh] pb-24">
      <AppHeader title={data?.displayName ?? "Сотрудник"} subtitle={data?.position ?? undefined} showBack backHref={backHref} showThemeSwitcher={false} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-20 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}
        {status === "denied" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Раздел недоступен</p>
          </GlassCard>
        )}
        {status === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={load}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && data && (
          <>
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-5 text-brand" />
                  </span>
                  <p className="font-bold">Общий прогресс</p>
                </div>
                <div className="mt-3">
                  <XPProgress value={ratio} size="md" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.overall.total > 0 ? `${data.overall.completed} из ${data.overall.total} уроков` : "Нет данных"}
                </p>
              </GlassCard>
            </motion.div>

            {data.programs.length === 0 ? (
              <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
                <p className="text-sm text-muted-foreground">Пока нет доступного обучения.</p>
              </GlassCard>
            ) : (
              data.programs.map((program) => (
                <motion.div key={program.id} variants={cardIn} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-bold text-foreground">{program.title}</p>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {program.completedLessons}/{program.totalLessons}
                    </span>
                  </div>
                  <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
                    {program.lessons.map((lesson) => (
                      <LessonRow key={lesson.id} lesson={lesson} />
                    ))}
                  </GlassCard>
                </motion.div>
              ))
            )}
          </>
        )}
      </motion.main>
    </div>
  );
}

function LessonRow({ lesson }: { lesson: EmployeeTrainingLessonDTO }) {
  return (
    <div className="flex items-center gap-3 p-4">
      {lesson.completed ? (
        <CheckCircle2 className="size-4.5 shrink-0 text-success" />
      ) : (
        <Circle className="size-4.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold", lesson.completed && "text-foreground")}>{lesson.title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" /> ~{lesson.durationMinutes} мин
          {lesson.completedAt && ` · завершён ${new Date(lesson.completedAt).toLocaleDateString("ru-RU")}`}
        </p>
      </div>
      {lesson.quiz && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
            lesson.quiz.passed ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {lesson.quiz.scorePercent}%
        </span>
      )}
    </div>
  );
}
