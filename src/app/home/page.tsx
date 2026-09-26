"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Award,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  GraduationCap,
  ListChecks,
  Lock,
  type LucideIcon,
  Sparkles,
  Trophy,
  UserCog,
  Users,
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
import { pluralRu } from "@/lib/cabinet-ui";
import { fetchHome } from "@/lib/api/home-client";
import type {
  CityManagerHomeBlockDTO,
  ClubManagerHomeBlockDTO,
  DailyTaskDTO,
  HomeDashboardDTO,
  HomeResponseDTO,
  MysterySummaryDTO,
  OnboardingHomeDTO,
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
  const [dash, setDash] = useState<HomeResponseDTO | null>(null);
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
          {/* User block → Profile (Profile is no longer a bottom-nav tab). Large
              tap zone; a subtle chevron signals it's interactive. */}
          <Link
            href="/profile"
            aria-label="Открыть профиль"
            className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 transition-colors active:bg-foreground/5"
          >
            <Avatar name={profile.displayName} src={telegramUser.photoUrl} size={48} ring />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{greeting},</p>
              <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{firstName}</h1>
              {identity && <p className="truncate text-xs font-medium text-muted-foreground">{identity}</p>}
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
          </Link>
          <ThemeSwitcher />
        </div>
        {dash?.kind === "full" && dash.roleLabel && (
          <div className="mt-2 pl-[60px]">
            <span className="inline-flex items-center rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">
              {dash.roleLabel}
            </span>
          </div>
        )}
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

        {dashStatus === "ready" && dash && dash.kind === "onboarding" && (
          <OnboardingContent academy={dash.academy} onContinue={(slug) => router.push(slug ? `/academy/lesson/${slug}` : "/academy")} />
        )}

        {dashStatus === "ready" && dash && dash.kind === "full" && (
          <>
            {dash.management?.role === "CITY_MANAGER" && (
              <CityManagerHomeSection block={dash.management} router={router} />
            )}

            <motion.div variants={cardIn}>
              <PlanCard plan={dash.plan} onOpen={() => router.push("/plan")} />
            </motion.div>

            {dash.management?.role === "CLUB_MANAGER" && (
              <ClubManagerHomeSection block={dash.management} router={router} />
            )}

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Продолжить обучение</p>
              <ContinueLearningCard />
            </motion.div>

            <motion.div variants={cardIn}>
              <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/knowledge")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                    <BookOpen className="size-5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">База знаний</p>
                    <p className="truncate text-xs text-muted-foreground">Скрипты и рабочие инструкции</p>
                  </div>
                  <span className="text-xs font-semibold text-brand">Открыть</span>
                </div>
              </GlassCard>
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

/* ------------------------- onboarding (PENDING_APPROVAL) ------------------------ */

/**
 * Sprint: mini-app-role-experience, section 2 — replaces the old
 * PendingApprovalScreen dead-end. Exact approved copy: the status banner and
 * course card are the only content a PENDING_APPROVAL user sees on Главная —
 * no Metric/rating/knowledge-base/Daily Plan/management data exists on
 * OnboardingHomeDTO at all, so there's nothing here that could leak it.
 */
function OnboardingContent({
  academy,
  onContinue,
}: {
  academy: OnboardingHomeDTO["academy"];
  onContinue: (slug: string | null) => void;
}) {
  return (
    <>
      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="lg" animateIn={false} className="border border-brand/25 bg-brand/[0.07]">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/15">
              <Lock className="size-5 text-brand" />
            </span>
            <p className="font-bold">Доступ пока ограничен</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Сейчас вам доступно вводное обучение. Полный доступ к Metro UP откроется после подтверждения руководителем.
          </p>
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <p className="px-1 text-sm font-bold text-foreground">Знакомство с MetroFitness</p>
        {academy ? (
          <GlassCard variant="solid" pad="lg" animateIn={false}>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
                <GraduationCap className="size-5 text-brand" />
              </span>
              <p className="font-bold">{academy.courseTitle}</p>
            </div>
            <div className="mt-3">
              <XPProgress value={academy.total ? academy.completed / academy.total : 0} size="md" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {academy.completed} из {pluralRu(academy.total, "урока", "уроков", "уроков")}
              {academy.totalDurationMinutes > 0 && ` · ~${academy.totalDurationMinutes} мин`}
            </p>
            <Button className="mt-4" variant="secondary" block onClick={() => onContinue(academy.nextLessonSlug)}>
              Продолжить обучение
            </Button>
          </GlassCard>
        ) : (
          <GlassCard variant="solid" pad="lg" animateIn={false} className="text-center">
            <p className="font-semibold">Вводное обучение скоро появится</p>
            <p className="mt-1 text-sm text-muted-foreground">Загляните сюда чуть позже.</p>
          </GlassCard>
        )}
      </motion.div>
    </>
  );
}

/* --------------------------- role-aware management blocks --------------------------- */

type HomeRouter = { push: (href: string) => void };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-sm font-bold text-foreground">{children}</p>;
}

function EmptyAttention() {
  return (
    <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-success/12">
        <CheckCircle2 className="size-5 text-success" />
      </span>
      <p className="text-sm text-muted-foreground">Сейчас ничего не требует внимания.</p>
    </GlassCard>
  );
}

/**
 * Section 11 — CITY_MANAGER Home: management BEFORE personal info, order
 * Требует внимания → Мои клубы → Управляющие → Обучение по клубам. Every tap
 * target opens a Mini App drill-down screen (never /control) reusing the
 * existing RoleAssignment/cabinet APIs.
 */
function CityManagerHomeSection({ block, router }: { block: CityManagerHomeBlockDTO; router: HomeRouter }) {
  const clubsWithoutManager = block.clubs.filter((c) => c.managerName === null);
  const pendingClubs = block.attention.filter((a) => a.category === "PENDING_EMPLOYEE_APPROVAL");

  return (
    <>
      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <SectionLabel>Требует внимания</SectionLabel>
        {block.attention.length === 0 ? (
          <EmptyAttention />
        ) : (
          <div className="flex flex-col gap-2">
            {clubsWithoutManager.length > 0 && (
              <AttentionRow
                icon={UserCog}
                text={`${clubsWithoutManager.length} ${pluralRu(clubsWithoutManager.length, "клуб без управляющего", "клуба без управляющего", "клубов без управляющего")}`}
                onClick={() => router.push("/city/managers")}
              />
            )}
            {pendingClubs.length > 0 && (
              <AttentionRow
                icon={Users}
                text={`${pendingClubs.length} ${pluralRu(pendingClubs.length, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`}
                onClick={() => router.push("/city")}
              />
            )}
          </div>
        )}
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <SectionLabel>Мои клубы</SectionLabel>
          <span className="text-xs font-semibold text-muted-foreground">{block.scopeLabel}</span>
        </div>
        <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
          {block.clubs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Нет клубов в зоне ответственности.</p>
          ) : (
            block.clubs.map((c) => (
              <button
                key={c.clubId}
                type="button"
                onClick={() => router.push(`/city/club?clubId=${c.clubId}`)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-foreground/5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
                  <Building2 className="size-4.5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.clubName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.managerName ?? "Без управляющего"} · {pluralRu(c.employeeCount, "сотрудник", "сотрудника", "сотрудников")}
                  </p>
                </div>
                {c.attentionCount > 0 && (
                  <span className="shrink-0 rounded-full bg-brand/12 px-2 py-0.5 text-xs font-bold text-brand">{c.attentionCount}</span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
              </button>
            ))
          )}
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <SectionLabel>Управляющие</SectionLabel>
        <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
          {block.clubs.map((c) => (
            <div key={c.clubId} className="flex items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
                <UserCog className="size-4.5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.managerName ?? "Не назначен"}</p>
                <p className="truncate text-xs text-muted-foreground">{c.clubName}</p>
              </div>
              {c.managerName === null && (
                <Button size="sm" variant="secondary" onClick={() => router.push(`/city/club?clubId=${c.clubId}`)}>
                  Назначить
                </Button>
              )}
            </div>
          ))}
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <SectionLabel>Обучение по клубам</SectionLabel>
        <div className="mt-3">
          <TrainingSummaryCard
            totalPublishedLessons={block.training?.totalPublishedLessons ?? 0}
            line1={
              block.training && block.training.totalPublishedLessons > 0 && block.training.averageProgressPercent !== null
                ? `Средний прогресс: ${block.training.averageProgressPercent}%`
                : "Нет данных"
            }
            line2={block.training ? `Завершили все опубликованные уроки: ${block.training.employeesCompletedAll}` : undefined}
          />
        </div>
      </motion.div>
    </>
  );
}

/**
 * Section 6 — CLUB_MANAGER Home order: План на сегодня (rendered by the
 * caller, unchanged PlanCard) → Требует внимания → Моя команда → Обучение
 * команды → Мой клуб → personal content. Multi-club managers get a neutral
 * "choose a club" card instead (section 6 — never silently pick one).
 */
function ClubManagerHomeSection({ block, router }: { block: ClubManagerHomeBlockDTO; router: HomeRouter }) {
  if (block.clubId === null) {
    return (
      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="lg" animateIn={false} interactive onClick={() => router.push("/team")}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
              <Building2 className="size-5 text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Вы управляете {block.clubLabel}</p>
              <p className="text-xs text-muted-foreground">Открыть команду, чтобы выбрать клуб</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </div>
        </GlassCard>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div variants={cardIn} className="flex flex-col gap-3">
        <SectionLabel>Требует внимания</SectionLabel>
        {block.attention.length === 0 ? (
          <EmptyAttention />
        ) : (
          <AttentionRow
            icon={Users}
            text={`${block.attention.length} ${pluralRu(block.attention.length, "сотрудник ожидает подтверждения", "сотрудника ожидают подтверждения", "сотрудников ожидают подтверждения")}`}
            onClick={() => router.push("/team")}
          />
        )}
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={() => router.push("/team")}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
              <Users className="size-5 text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Моя команда</p>
              <p className="truncate text-xs text-muted-foreground">
                {pluralRu(block.employeeCount ?? 0, "сотрудник", "сотрудника", "сотрудников")}
                {(block.pendingApprovalCount ?? 0) > 0 && ` · ${block.pendingApprovalCount} новых`}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </div>
        </GlassCard>
      </motion.div>

      <motion.div variants={cardIn}>
        <SectionLabel>Обучение команды</SectionLabel>
        <div className="mt-3">
          <TrainingSummaryCard
            totalPublishedLessons={block.training?.totalPublishedLessons ?? 0}
            line1={
              block.training && block.training.totalPublishedLessons > 0
                ? `Завершили все опубликованные уроки: ${block.training.employeesCompleted}`
                : "Нет данных"
            }
            line2={block.training && block.training.totalPublishedLessons > 0 ? `Проходят обучение: ${block.training.employeesInTraining}` : undefined}
          />
        </div>
      </motion.div>

      <motion.div variants={cardIn}>
        <GlassCard variant="solid" pad="md" animateIn={false} className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
            <Building2 className="size-5 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{block.clubLabel}</p>
            <p className="truncate text-xs text-muted-foreground">Мой клуб</p>
          </div>
          {block.isPreviewing && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Просмотр</span>
          )}
        </GlassCard>
      </motion.div>
    </>
  );
}

function AttentionRow({ icon: Icon, text, onClick }: { icon: LucideIcon; text: string; onClick: () => void }) {
  return (
    <GlassCard variant="solid" pad="md" animateIn={false} interactive onClick={onClick} className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-brand/12">
        <Icon className="size-5 text-brand" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{text}</p>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </GlassCard>
  );
}

/** Honest empty state ("Нет данных") whenever there's no published content or
 * no one in scope yet — never a fabricated percent. Never says "mandatory" /
 * "overdue" / "failed plan" (section 10). */
function TrainingSummaryCard({ totalPublishedLessons, line1, line2 }: { totalPublishedLessons: number; line1: string; line2?: string }) {
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-brand/12">
          <GraduationCap className="size-5 text-brand" />
        </span>
        <p className="font-bold">{totalPublishedLessons > 0 ? `${totalPublishedLessons} уроков в Академии` : "Академия"}</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{line1}</p>
      {line2 && <p className="mt-1 text-sm text-muted-foreground">{line2}</p>}
    </GlassCard>
  );
}
