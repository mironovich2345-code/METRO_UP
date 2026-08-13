"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Award,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  ListChecks,
  Lock,
  Sparkles,
  Trophy,
} from "lucide-react";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Avatar } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { XPProgress } from "@/components/ui/xp-progress";
import { FirstRunWelcome } from "@/components/home/first-run-welcome";
import { ContinueLearningCard } from "@/components/home/ContinueLearningCard";
import { useApp } from "@/providers/app-provider";
import { getPositionById, getClubById, getCityById } from "@/content";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn, formatNumber } from "@/lib/utils";
import { fetchHome } from "@/lib/api/home-client";
import type {
  DailyTaskDTO,
  HomeDashboardDTO,
  MysterySummaryDTO,
  RatingSummaryDTO,
} from "@/lib/api/home-types";

const WELCOME_SEEN_KEY = "metro.home.welcomed";

function computeGreeting() {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

export default function HomeScreen() {
  const { profile, isOnboarded, hydrated, telegramUser } = useApp();
  const router = useRouter();

  const [greeting, setGreeting] = useState("С возвращением");
  const [showWelcome, setShowWelcome] = useState(false);
  const [dash, setDash] = useState<HomeDashboardDTO | null>(null);
  const [dashStatus, setDashStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => setGreeting(computeGreeting()), []);

  useEffect(() => {
    if (hydrated && !isOnboarded) router.replace("/welcome");
  }, [hydrated, isOnboarded, router]);

  const loadDash = () => {
    setDashStatus("loading");
    fetchHome()
      .then((d) => {
        setDash(d);
        setDashStatus("ready");
      })
      .catch(() => setDashStatus("error"));
  };
  useEffect(() => {
    if (isOnboarded) loadDash();
  }, [isOnboarded]);

  useEffect(() => {
    if (!isOnboarded) return;
    try {
      const wants = new URLSearchParams(window.location.search).get("welcome") === "1";
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
  const identity = [
    getPositionById(profile.positionId)?.title,
    getClubById(profile.clubId)?.name,
    getCityById(profile.cityId)?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative min-h-[100dvh] pb-32">
      <header className="brand-aura px-5 pb-2 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center gap-3">
          <Avatar name={profile.displayName} src={telegramUser.photoUrl} size={48} ring />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{greeting},</p>
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{firstName}</h1>
            {identity && <p className="truncate text-xs font-medium text-muted-foreground">{identity}</p>}
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-6 px-5 pt-4">
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

        {dashStatus === "loading" && (
          <div className="flex flex-col gap-4">
            <div className="h-32 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}

        {dashStatus === "error" && (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Не удалось загрузить данные</p>
            <Button className="mt-4" variant="secondary" onClick={loadDash}>Повторить</Button>
          </GlassCard>
        )}

        {dashStatus === "ready" && dash && (
          <>
            <motion.div variants={cardIn}>
              <PlanCard plan={dash.plan} onOpen={() => router.push("/plan")} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Продолжить обучение</p>
              <ContinueLearningCard />
            </motion.div>

            <motion.div variants={cardIn}>
              <XpCard total={dash.xp.total} today={dash.xp.today} />
            </motion.div>

            {dash.lastAchievement && (
              <motion.div variants={cardIn}>
                <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/achievements")}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                      <Award className="size-5 text-brand" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Последнее достижение</p>
                      <p className="truncate font-semibold">{dash.lastAchievement.title}</p>
                    </div>
                    <span className="text-xs font-semibold text-brand">Все</span>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            <motion.div variants={cardIn}>
              <RatingCard rating={dash.rating} onOpen={() => router.push("/ranking")} />
            </motion.div>

            <motion.div variants={cardIn}>
              <MysteryCard mystery={dash.mystery} />
            </motion.div>
          </>
        )}
      </motion.main>

      <BottomNavigation />
    </div>
  );
}

/* --------------------------------- cards --------------------------------- */

function PlanCard({ plan, onOpen }: { plan: HomeDashboardDTO["plan"]; onOpen: () => void }) {
  const ratio = plan.total ? plan.completed / plan.total : 0;
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
            <ListChecks className="size-5 text-brand" />
          </span>
          <p className="font-bold">План на сегодня</p>
        </div>
        <span className="text-sm font-semibold text-muted-foreground">
          {plan.completed} из {plan.total}
        </span>
      </div>
      <div className="mt-3"><XPProgress value={ratio} size="md" /></div>

      {plan.total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">На сегодня задач нет</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {plan.tasks.map((t) => <PlanTaskRow key={t.id} task={t} />)}
        </ul>
      )}

      <Button className="mt-4" variant="secondary" block onClick={onOpen}>
        Открыть план
      </Button>
    </GlassCard>
  );
}

function PlanTaskRow({ task }: { task: DailyTaskDTO }) {
  const done = task.status === "COMPLETED";
  const skipped = task.status === "SKIPPED";
  const checkDone = task.checklist.filter((c) => c.done).length;
  return (
    <li className="flex items-center gap-2.5 text-[15px]">
      {done ? (
        <CheckCircle2 className="size-4.5 shrink-0 text-success" />
      ) : task.mode === "blocked" ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Circle className="size-4.5 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", (done || skipped) && "text-muted-foreground line-through")}>{task.title}</span>
      {task.priority === "HIGH" && !done && <span className="shrink-0 rounded-full bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">Приоритет</span>}
      {task.timeHint && !done && <span className="shrink-0 text-[11px] text-muted-foreground">{task.timeHint}</span>}
      {task.checklist.length > 0 && !done && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{checkDone}/{task.checklist.length}</span>}
    </li>
  );
}

function XpCard({ total, today }: { total: number; today: number }) {
  return (
    <GlassCard variant="brand" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-brand-foreground" />
        <p className="font-bold text-brand-foreground">Твой опыт</p>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-brand-foreground">{formatNumber(total)} XP</p>
      <p className="mt-1 text-sm text-brand-foreground/80">
        {today > 0 ? `Сегодня: +${today} XP` : "Сегодня пока без новых XP"}
      </p>
    </GlassCard>
  );
}

function DeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta == null || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-success" : "text-red-500")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(delta)}
    </span>
  );
}

function RatingCard({ rating, onOpen }: { rating: RatingSummaryDTO; onOpen: () => void }) {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false} interactive onClick={onOpen}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
            <Trophy className="size-5 text-brand" />
          </span>
          <p className="font-bold">Рейтинг</p>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </div>
      {!rating.hasData ? (
        <div className="mt-2">
          <p className="text-sm font-semibold">Рейтинг пока не сформирован</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Здесь появятся результаты после публикации первого рейтинга.
          </p>
        </div>
      ) : rating.rank == null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {rating.periodLabel} · ты пока не в опубликованном рейтинге
        </p>
      ) : (
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{rating.periodLabel}</p>
            <p className="text-2xl font-extrabold">{rating.rank} место</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{rating.finalScore?.toFixed(1)}</p>
            <DeltaBadge delta={rating.delta} />
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function MysteryCard({ mystery }: { mystery: MysterySummaryDTO }) {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
          <Eye className="size-5 text-brand" />
        </span>
        <p className="font-bold">Тайный покупатель</p>
      </div>
      {!mystery.hasData ? (
        <div className="mt-2">
          <p className="text-sm font-semibold">Результат появится после первой проверки</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Здесь ты увидишь итоговый балл и обратную связь.
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex items-end justify-between">
            <p className="text-xs text-muted-foreground">{mystery.periodLabel}</p>
            <p className="text-3xl font-extrabold text-foreground">{mystery.score}</p>
          </div>
          {mystery.comment && <p className="mt-2 text-sm text-muted-foreground">{mystery.comment}</p>}
        </div>
      )}
    </GlassCard>
  );
}
