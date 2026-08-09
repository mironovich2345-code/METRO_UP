"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, GraduationCap, Lock } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { XPProgress } from "@/components/ui/xp-progress";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/telegram";
import { fetchAcademyOverview } from "@/lib/api/content-client";
import type { AcademyDayCardDTO, AcademyOverviewDTO } from "@/lib/api/content-types";

/**
 * Academy — DB/CMS is the source of truth. Programs, days, lessons and progress
 * all come from PostgreSQL (PUBLISHED lessons only). No static mock lesson data.
 */
export default function AcademyScreen() {
  const [data, setData] = useState<AcademyOverviewDTO | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = () => {
    setStatus("loading");
    fetchAcademyOverview()
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };
  useEffect(load, []);

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <AppHeader title="Академия" subtitle="Твои курсы и прогресс" />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="px-5">
        {status === "loading" && (
          <div className="space-y-4">
            <div className="h-28 w-full animate-pulse rounded-3xl bg-muted" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-36 animate-pulse rounded-3xl bg-muted" />
              <div className="h-36 animate-pulse rounded-3xl bg-muted" />
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-16 text-center">
            <p className="font-semibold">Не удалось загрузить</p>
            <Button className="mt-4" variant="secondary" onClick={load}>
              Повторить
            </Button>
          </div>
        )}

        {status === "ready" && data && !data.hasContent && (
          <motion.div variants={cardIn} className="mt-10">
            <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
              <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand/12">
                <GraduationCap className="size-6 text-brand" />
              </span>
              <p className="font-semibold">Здесь скоро появятся уроки</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Обучение готовится. Загляни чуть позже.
              </p>
            </GlassCard>
          </motion.div>
        )}

        {status === "ready" && data && data.hasContent && (
          <>
            {/* Overall progress — by PUBLISHED required lessons */}
            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="lg" animateIn={false}>
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/12">
                    <GraduationCap className="size-7 text-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Общий прогресс</p>
                    <p className="text-2xl font-extrabold tracking-tight text-foreground">
                      {Math.round(data.overall.ratio * 100)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-foreground">{data.overall.completed}</p>
                    <p className="text-xs font-medium text-muted-foreground">
                      из {data.overall.total} уроков
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <XPProgress value={data.overall.ratio} size="md" />
                </div>
              </GlassCard>
            </motion.div>

            {data.programs.map((program) => (
              <div key={program.id}>
                <motion.div variants={cardIn} className="mt-6">
                  <SectionHeader title={program.title} />
                </motion.div>
                {program.days.length === 0 ? (
                  <motion.p variants={cardIn} className="mt-2 text-sm text-muted-foreground">
                    Дни ещё не заданы
                  </motion.p>
                ) : (
                  <motion.div
                    variants={staggerStack}
                    initial="hidden"
                    animate="show"
                    className="mt-3 grid grid-cols-2 gap-3"
                  >
                    {program.days.map((day) => (
                      <motion.div key={day.id} variants={cardIn}>
                        <DayCardDb day={day} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            ))}
          </>
        )}
      </motion.main>

      <BottomNavigation />
    </div>
  );
}

function DayCardDb({ day }: { day: AcademyDayCardDTO }) {
  const router = useRouter();
  const empty = day.totalLessons === 0;
  const done = day.totalLessons > 0 && day.completedLessons === day.totalLessons;
  const disabled = day.locked || empty;

  const open = () => {
    if (disabled) return;
    haptic("medium");
    router.push(`/academy/${day.id}`);
  };

  return (
    <GlassCard
      variant="solid"
      pad="md"
      animateIn={false}
      interactive={!disabled}
      onClick={open}
      className={cn("flex h-full flex-col", disabled && "opacity-60")}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl text-sm font-bold",
            done ? "bg-success text-white" : day.locked ? "bg-muted text-muted-foreground" : "bg-brand/12 text-brand",
          )}
        >
          {done ? <CheckCircle2 className="size-5" /> : day.locked ? <Lock className="size-4" /> : day.virtual ? <GraduationCap className="size-5" /> : day.dayNumber}
        </span>
        {!empty && (
          <Badge variant="neutral" size="sm">
            {day.completedLessons}/{day.totalLessons}
          </Badge>
        )}
      </div>

      <p className="mt-3 line-clamp-2 font-bold leading-tight">{day.title}</p>

      {empty ? (
        <p className="mt-1 text-xs text-muted-foreground">Скоро появятся уроки</p>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" /> ~{day.durationMinutes} мин
          </div>
          <div className="mt-auto pt-3">
            <XPProgress value={day.progressPercent / 100} size="sm" />
          </div>
        </>
      )}
    </GlassCard>
  );
}
