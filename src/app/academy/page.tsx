"use client";

import { motion } from "framer-motion";
import { GraduationCap, Lock } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { AppHeader } from "@/components/app-header";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { SectionHeader } from "@/components/ui/section-header";
import { DayCard } from "@/components/day-card";
import { LockedCourseCard } from "@/components/locked-course-card";
import {
  ADAPTATION_PROGRAM,
  ADVANCED_COURSES,
  ADVANCED_LOCK_REASON,
  programProgress,
} from "@/content";
import { cardIn, staggerStack } from "@/lib/motion";

export default function AcademyScreen() {
  const program = ADAPTATION_PROGRAM;
  const progress = programProgress(program);

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
                  {Math.round(progress.ratio * 100)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-foreground">
                  {progress.completed}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  из {progress.total} уроков
                </p>
              </div>
            </div>
            <div className="mt-4">
              <XPProgress value={progress.ratio} size="md" />
            </div>
          </GlassCard>
        </motion.div>

        {/* Base adaptation — three days */}
        <motion.div variants={cardIn} className="mt-6">
          <SectionHeader title={program.title} />
        </motion.div>
        <motion.div
          variants={staggerStack}
          initial="hidden"
          animate="show"
          className="mt-3 grid grid-cols-2 gap-3"
        >
          {program.days.map((day) => (
            <motion.div key={day.id} variants={cardIn}>
              <DayCard day={day} />
            </motion.div>
          ))}
        </motion.div>

        {/* Locked advanced Academy */}
        <motion.div variants={cardIn} className="mt-8">
          <SectionHeader title="Дальше в Академии" />
          <GlassCard
            variant="outline"
            pad="md"
            animateIn={false}
            className="mt-3 flex items-start gap-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="size-4" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {ADVANCED_LOCK_REASON}
            </p>
          </GlassCard>
        </motion.div>
        <motion.div
          variants={staggerStack}
          initial="hidden"
          animate="show"
          className="mt-3 grid grid-cols-2 gap-3"
        >
          {ADVANCED_COURSES.map((course) => (
            <motion.div key={course.id} variants={cardIn}>
              <LockedCourseCard course={course} />
            </motion.div>
          ))}
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
