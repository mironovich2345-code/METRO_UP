"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Avatar } from "@/components/ui/avatar";
import { MetricCharacter } from "@/components/ui/metric-character";
import { SectionHeader } from "@/components/ui/section-header";
import { CareerCard } from "@/components/home/career-card";
import { XPCard } from "@/components/home/xp-card";
import { FirstRunWelcome } from "@/components/home/first-run-welcome";
import { ContinueLearningCard } from "@/components/home/ContinueLearningCard";
import { RatingPlaceCard } from "@/components/home/rating-place-card";
import { TaskCard } from "@/components/task-card";
import { NewsCard } from "@/components/news-card";
import { MysteryShopperCard } from "@/components/mystery-shopper-card";
import { AchievementCard } from "@/components/achievement-card";
import { useApp } from "@/providers/app-provider";
import {
  ADAPTATION_PROGRAM,
  getCityById,
  getClubById,
  getPositionById,
  programProgress,
} from "@/content";
import { CURRENT_EMPLOYEE_ID } from "@/domain/rating";
import {
  ACHIEVEMENTS,
  DAILY_TASKS,
  MYSTERY_SHOPPER,
  NEWS,
} from "@/lib/data";
import { cardIn, staggerStack } from "@/lib/motion";
import { formatNumber } from "@/lib/utils";

const WELCOME_SEEN_KEY = "metro.home.welcomed";

function computeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

const Section = motion.section;

export default function HomeScreen() {
  const { profile, isOnboarded, hydrated, telegramUser } = useApp();
  const router = useRouter();

  const [greeting, setGreeting] = useState("С возвращением");
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => setGreeting(computeGreeting()), []);

  // Onboarding guard: no valid profile → back to onboarding.
  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  // First-run welcome (once), triggered by /home?welcome=1.
  useEffect(() => {
    if (!isOnboarded) return;
    try {
      const wants =
        new URLSearchParams(window.location.search).get("welcome") === "1";
      const seen = localStorage.getItem(WELCOME_SEEN_KEY) === "1";
      if (wants && !seen) setShowWelcome(true);
    } catch {
      /* noop */
    }
  }, [isOnboarded]);

  const dismissWelcome = () => {
    setShowWelcome(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
      window.history.replaceState({}, "", "/home");
    } catch {
      /* noop */
    }
  };

  if (!hydrated || !profile) {
    return <div className="min-h-[100dvh]" />;
  }

  const firstName = profile.displayName.split(" ")[0];
  const position = getPositionById(profile.positionId);
  const club = getClubById(profile.clubId);
  const city = getCityById(profile.cityId);
  const identity = [position?.title, club?.name, city?.name]
    .filter(Boolean)
    .join(" · ");
  const adaptation = programProgress(ADAPTATION_PROGRAM);
  const doneToday = DAILY_TASKS.filter((t) => t.done).length;

  return (
    <div className="relative min-h-[100dvh] pb-32">
      {/* Greeting */}
      <header className="brand-aura px-5 pb-2 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          <Avatar
            name={profile.displayName}
            src={telegramUser.photoUrl}
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
          <ThemeSwitcher />
        </div>
      </header>

      <motion.main
        variants={staggerStack}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-7 px-5 pt-4"
      >
        {showWelcome && (
          <motion.div variants={cardIn}>
            <FirstRunWelcome
              name={firstName}
              onStart={() => {
                dismissWelcome();
                router.push("/academy");
              }}
              onDismiss={dismissWelcome}
            />
          </motion.div>
        )}

        {/* Career level */}
        <motion.div variants={cardIn}>
          <CareerCard adaptationRatio={adaptation.ratio} />
        </motion.div>

        {/* XP */}
        <motion.div variants={cardIn}>
          <XPCard employeeId={CURRENT_EMPLOYEE_ID} />
        </motion.div>

        {/* Today's plan */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader title="План на сегодня" />
          <div>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
                Выполнено {doneToday} из {DAILY_TASKS.length}
              </p>
              <p className="shrink-0 whitespace-nowrap text-sm font-bold text-brand">
                +
                {formatNumber(
                  DAILY_TASKS.reduce((s, t) => s + (t.done ? 0 : t.xp), 0),
                )}{" "}
                XP
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {DAILY_TASKS.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        </Section>

        {/* Continue learning */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader
            title="Продолжить обучение"
            action={{ label: "Все курсы", href: "/academy" }}
          />
          <ContinueLearningCard />
        </Section>

        {/* Monthly rating — place last month */}
        <Section variants={cardIn} className="flex flex-col gap-3">
          <SectionHeader
            title="Рейтинг"
            action={{ label: "Открыть", href: "/ranking" }}
          />
          <RatingPlaceCard />
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
            Отличный старт! Пройди базовую адаптацию и открой новые возможности.
          </p>
        </motion.div>
      </motion.main>

      <BottomNavigation />
    </div>
  );
}
