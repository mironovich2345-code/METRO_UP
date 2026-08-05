"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Avatar } from "@/components/ui/avatar";
import { MetricCharacter } from "@/components/ui/metric-character";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { ProgressCard } from "@/components/progress-card";
import { LessonCard } from "@/components/lesson-card";
import { RankingCard } from "@/components/ranking-card";
import { TaskCard } from "@/components/task-card";
import { NewsCard } from "@/components/news-card";
import { MysteryShopperCard } from "@/components/mystery-shopper-card";
import { AchievementCard } from "@/components/achievement-card";
import { useApp } from "@/providers/app-provider";
import {
  ACHIEVEMENTS,
  cityById,
  clubById,
  CONTINUE_COURSE,
  COURSES,
  DAILY_TASKS,
  MYSTERY_SHOPPER,
  NEWS,
  positionById,
  RANKING_PREVIEW,
} from "@/lib/data";
import { cardIn, staggerStack } from "@/lib/motion";

function computeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

const Section = motion.section;

export default function HomeScreen() {
  const { profile, telegramUser } = useApp();

  // Time-of-day greeting resolved after mount to avoid hydration mismatch.
  const [greeting, setGreeting] = useState("С возвращением");
  useEffect(() => setGreeting(computeGreeting()), []);

  const firstName = profile.displayName.split(" ")[0];
  const position = positionById(profile.positionId);
  const club = clubById(profile.clubId);
  const city = cityById(profile.cityId);
  const identity = [position?.title, club?.name, city?.name]
    .filter(Boolean)
    .join(" · ");
  const continueCourse = COURSES.find((c) => c.id === CONTINUE_COURSE.courseId);
  const continueRatio = continueCourse
    ? continueCourse.completedLessons / continueCourse.totalLessons
    : 0;
  const doneToday = DAILY_TASKS.filter((t) => t.done).length;

  return (
    <div className="relative min-h-[100dvh] pb-32">
      {/* Greeting */}
      <header className="brand-aura px-5 pb-2 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          <Avatar
            name={profile.displayName}
            src={telegramUser?.photoUrl}
            size={48}
            ring
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {greeting},
            </p>
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
              {firstName}
            </h1>
            {identity && (
              <p className="truncate text-xs font-medium text-muted-foreground">
                {identity}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-3 py-2.5">
              <Flame className="size-4 text-brand" fill="currentColor" />
              <span className="text-sm font-bold text-foreground">
                {profile.streak}
              </span>
            </div>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-7 px-5 pt-4"
      >
        {/* Level */}
        <motion.div variants={cardIn}>
          <ProgressCard xp={profile.xp} />
        </motion.div>

        {/* Today's plan */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="План на сегодня" />
          <GlassCard variant="plain" pad="none" animateIn={false}>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-sm font-medium text-muted-foreground">
                Выполнено {doneToday} из {DAILY_TASKS.length}
              </p>
              <p className="text-sm font-bold text-brand">
                +{DAILY_TASKS.reduce((s, t) => s + (t.done ? 0 : t.xp), 0)} XP
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {DAILY_TASKS.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </GlassCard>
        </Section>

        {/* Continue learning */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Продолжить обучение" action={{ label: "Все курсы", href: "/academy" }} />
          <LessonCard
            courseTitle={CONTINUE_COURSE.courseTitle}
            lessonTitle={CONTINUE_COURSE.lessonTitle}
            icon={CONTINUE_COURSE.icon}
            progress={continueRatio}
          />
        </Section>

        {/* Ranking */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Рейтинг" action={{ label: "Открыть", href: "/ranking" }} />
          <RankingCard entries={RANKING_PREVIEW} />
        </Section>

        {/* Mystery shopper */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Тайный покупатель" />
          <MysteryShopperCard result={MYSTERY_SHOPPER} />
        </Section>

        {/* Company news */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Новости компании" />
          <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5">
            {NEWS.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        </Section>

        {/* Recent achievements */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="Последние достижения" />
          <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5">
            {ACHIEVEMENTS.map((a) => (
              <AchievementCard key={a.id} achievement={a} />
            ))}
          </div>
        </Section>

        {/* Metric sign-off */}
        <motion.div
          variants={cardIn}
          className="flex flex-col items-center gap-3 pb-2 pt-2"
        >
          <MetricCharacter size={72} mood="cheer" />
          <p className="max-w-[240px] text-center text-sm font-medium text-muted-foreground">
            Отличный темп! Заверши план на сегодня и обгони ещё двоих в рейтинге.
          </p>
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
