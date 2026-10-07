"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, Clock, Eye, GraduationCap, MessageSquareOff } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/ui/avatar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { XPProgress } from "@/components/ui/xp-progress";
import { RevalidatingBar } from "@/components/ui/revalidating-bar";
import { ApiError } from "@/lib/api/client";
import { cabinetApi } from "@/lib/api/cabinet-client";
import type {
  EmployeeTrainingLessonDTO,
  EmployeeTrainingProgramDTO,
  ManagementEmployeeMysteryResultDTO,
  ManagementEmployeeTestSummaryDTO,
} from "@/lib/api/cabinet-client";
import { useQuery, QUERY_POLICY } from "@/lib/client/query-cache";
import { cacheKeys } from "@/lib/client/cache-keys";
import { cardIn, staggerStack } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatTenureRu, pluralRu } from "@/lib/cabinet-ui";

/**
 * Management Round E1 — the ONE shared management Employee Card, reached
 * from /team (both a real CLUB_MANAGER's own roster and a CITY_MANAGER's
 * read-only drill-down). Authorization is entirely server-side (GET
 * /api/control/cabinet/employee-training re-derives club.read/the legacy
 * tier against the real actor's current grants) — this page never decides
 * who may see what, it only renders what the server returns or denies.
 * Same route, same URL, same auth as before this round — only the response
 * (ManagementEmployeeCardDTO) got richer (profile/employment/tests/mystery
 * shopper, alongside the pre-existing learning detail).
 */
export default function EmployeeTrainingPage() {
  const search = useSearchParams();
  const userId = search.get("userId");
  const clubId = search.get("clubId");

  const fetchDetail = useCallback(() => cabinetApi.employeeTraining(userId!), [userId]);
  const { data, error, isLoading, isValidating, mutate } = useQuery(
    userId ? cacheKeys.employeeTraining(userId) : null,
    fetchDetail,
    QUERY_POLICY.MUTABLE, // per-employee progress — changes whenever they complete a lesson
  );
  const status: "loading" | "ready" | "error" | "denied" =
    error instanceof ApiError && (error.status === 403 || error.status === 401)
      ? "denied"
      : error
        ? "error"
        : !data && isLoading
          ? "loading"
          : data
            ? "ready"
            : "loading";

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

  return (
    <div className="relative min-h-[100dvh] pb-24">
      {/* Section 4 — HEADER is just Back + name; the richer profile (avatar,
          position, club, city) lives in its own PROFILE SUMMARY card below,
          per the target IA's literal structure. */}
      <AppHeader title={data?.profile.displayName ?? "Сотрудник"} showBack backHref={backHref} showThemeSwitcher={false} />
      <RevalidatingBar show={Boolean(data) && isValidating} />

      <motion.main variants={staggerStack} initial="hidden" animate="show" className="flex flex-col gap-5 px-5 pt-2">
        {status === "loading" && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
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
            <Button className="mt-4" variant="secondary" onClick={() => mutate()}>Повторить</Button>
          </GlassCard>
        )}

        {status === "ready" && data && (
          <>
            <motion.div variants={cardIn}>
              <ProfileSummaryCard profile={data.profile} employment={data.employment} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Обучение</p>
              <LearningSection learning={data.learning} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Тесты</p>
              <TestsSection tests={data.tests} />
            </motion.div>

            <motion.div variants={cardIn} className="flex flex-col gap-3">
              <p className="px-1 text-sm font-bold text-foreground">Тайный покупатель</p>
              <MysterySection mystery={data.mysteryShopper} />
            </motion.div>
          </>
        )}
      </motion.main>
    </div>
  );
}

/* --------------------------- PROFILE SUMMARY --------------------------- */

function ProfileSummaryCard({
  profile,
  employment,
}: {
  profile: { displayName: string; avatarUrl: string | null; position: string | null; clubName: string | null; cityName: string | null };
  employment: { startedAt: string | null };
}) {
  const scopeLine = [profile.clubName, profile.cityName].filter(Boolean).join(" · ");
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center gap-3">
        <Avatar name={profile.displayName} src={profile.avatarUrl ?? undefined} size={56} ring />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-foreground">{profile.displayName}</p>
          {profile.position && <p className="truncate text-sm text-muted-foreground">{profile.position}</p>}
          {scopeLine && <p className="truncate text-xs text-muted-foreground">{scopeLine}</p>}
        </div>
      </div>
      {/* Section 4/6 — employment/date row only when a real, non-fabricated
          start date exists (EmploymentAssignment, never User.createdAt).
          No row at all otherwise — section 4's "Employment/date section
          only if truthful data exists" is explicit about hiding, not a
          calm placeholder, since literally every employee lacks this today
          (Round E0's audit: nothing writes to EmploymentAssignment yet). */}
      {employment.startedAt && (
        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Дата начала работы</p>
            <p className="font-semibold">{new Date(employment.startedAt).toLocaleDateString("ru-RU")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Стаж</p>
            <p className="font-semibold">{formatTenureRu(employment.startedAt)}</p>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

/* ----------------------------- LEARNING ----------------------------- */

function LearningSection({ learning }: { learning: { overall: { completed: number; total: number }; programs: EmployeeTrainingProgramDTO[] } }) {
  const { overall, programs } = learning;
  const ratio = overall.total > 0 ? overall.completed / overall.total : 0;
  const pct = overall.total > 0 ? Math.round(ratio * 100) : 0;

  return (
    <GlassCard variant="solid" pad="lg" animateIn={false}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-muted">
          <GraduationCap className="size-5 text-muted-foreground" />
        </span>
        <p className="font-bold">
          {overall.total > 0 ? `${overall.completed} из ${overall.total} уроков` : "Нет данных"}
        </p>
        {overall.total > 0 && <span className="ml-auto text-sm font-semibold text-muted-foreground">{pct}%</span>}
      </div>
      {overall.total > 0 && (
        <div className="mt-3">
          <XPProgress value={ratio} size="md" />
        </div>
      )}

      {programs.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          {programs.map((program) => (
            <ProgramRow key={program.id} program={program} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/** Section 7 — compact by default (title + X/Y); lessons only appear once
 * tapped open ("existing drill-down/detail may remain available" without
 * dumping every lesson on the first viewport). */
function ProgramRow({ program }: { program: EmployeeTrainingProgramDTO }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{program.title}</span>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          {program.completedLessons}/{program.totalLessons}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && program.lessons.length > 0 && (
        <div className="divide-y divide-border border-t border-border">
          {program.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({ lesson }: { lesson: EmployeeTrainingLessonDTO }) {
  return (
    <div className="flex items-center gap-3 p-3">
      {lesson.completed ? (
        <CheckCircle2 className="size-4.5 shrink-0 text-success" />
      ) : (
        <Circle className="size-4.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", lesson.completed && "text-foreground")}>{lesson.title}</p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Clock className="size-3 shrink-0" /> ~{lesson.durationMinutes} мин
          {lesson.completedAt && ` · завершён ${new Date(lesson.completedAt).toLocaleDateString("ru-RU")}`}
        </p>
      </div>
      {lesson.quiz && (
        <Badge variant={lesson.quiz.passed ? "success" : "neutral"} size="sm">
          {lesson.quiz.scorePercent}%
        </Badge>
      )}
    </div>
  );
}

/* ------------------------------- TESTS ------------------------------- */

/**
 * Section 8/9 — summary only, one compact row per quiz: title, pass/fail,
 * latest %, best %, last attempt date, attempt count. No per-attempt
 * history UI this round (section 9 explicitly allows deferring it; the
 * service shape — getEmployeeTestSummaries — is already the "prepare
 * cleanly" groundwork for it). Never renders QuizOption.isCorrect or raw
 * answers — the DTO itself never carries them.
 */
function TestsSection({ tests }: { tests: ManagementEmployeeTestSummaryDTO[] }) {
  if (tests.length === 0) {
    return (
      <GlassCard variant="solid" pad="sm" animateIn={false} className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">Не проходил</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
      {tests.map((t) => (
        <div key={t.quizId} className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{t.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              Лучший: {t.bestPercent}% · {t.attemptCount} {pluralRu(t.attemptCount, "попытка", "попытки", "попыток")} ·{" "}
              {new Date(t.lastAttemptAt).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <Badge variant={t.passed ? "success" : "neutral"} size="sm">
            {t.latestPercent}%
          </Badge>
        </div>
      ))}
    </GlassCard>
  );
}

/* --------------------------- MYSTERY SHOPPER --------------------------- */

function MysterySection({ mystery }: { mystery: { latest: ManagementEmployeeMysteryResultDTO | null; history: ManagementEmployeeMysteryResultDTO[] } }) {
  if (mystery.history.length === 0) {
    return (
      <GlassCard variant="solid" pad="sm" animateIn={false} className="flex items-center gap-2">
        <MessageSquareOff className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Нет результатов</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
      {mystery.history.map((r, i) => (
        <MysteryRow key={`${r.periodLabel}-${i}`} result={r} isLatest={i === 0} />
      ))}
    </GlassCard>
  );
}

/** Section 10 — a comment, when present, is tucked behind a tap (never
 * shown unprompted on the compact card itself). No score threshold/color —
 * a bare percentage, exactly like the existing employee-facing MysteryCard. */
function MysteryRow({ result, isLatest }: { result: ManagementEmployeeMysteryResultDTO; isLatest: boolean }) {
  const [open, setOpen] = useState(false);
  const hasComment = Boolean(result.comment);
  return (
    <div>
      <button
        type="button"
        onClick={() => hasComment && setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <Eye className="size-4.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{result.periodLabel}</p>
          {isLatest && <p className="text-xs text-muted-foreground">Последняя проверка</p>}
        </div>
        <span className="shrink-0 text-lg font-extrabold tabular-nums">{result.score}%</span>
        {hasComment && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && hasComment && <p className="px-4 pb-4 text-sm text-muted-foreground">{result.comment}</p>}
    </div>
  );
}
