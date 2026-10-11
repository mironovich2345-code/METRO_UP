"use client";

import type { KeyboardEvent } from "react";
import { CheckCircle2, ChevronRight, GraduationCap, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { XPProgress } from "@/components/ui/xp-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pluralRu } from "@/lib/cabinet-ui";
import type { CityManagerHomeClubDTO } from "@/lib/api/home-types";
import type { CityOverview, TodaySummary } from "@/lib/management-home";

/**
 * Sprint: LIVE QA QA-03 — presentational building blocks for the
 * CLUB_MANAGER ("Мой клуб") and CITY_MANAGER ("Моя территория") Home
 * dashboards. Three prominence levels, so a dashboard reads top-down instead
 * of as a wall of equal cards:
 *
 *   LEVEL 1 — the primary insight: TodayCard (club) / TerritoryOverviewCard
 *             (territory). Large numerals, generous padding, and the one soft
 *             brand wash on the screen.
 *   LEVEL 2 — what needs a decision, and the key summary: AttentionSection
 *             (management-primitives.tsx), TeamSummaryCard,
 *             TerritoryClubList.
 *   LEVEL 3 — supporting entry points: ManagementLinkGroup, outlined, with
 *             no fill and no shadow.
 *
 * Purely presentational: every value arrives as a prop already derived from
 * the real /api/home DTO by src/lib/management-home.ts — nothing here
 * fetches, computes a metric, or renders a number of its own. No component
 * sets its own `initial` either: entrance motion stays with Home's root
 * stagger (QA-01B — the cold open only), and progress bars paint at their
 * value (animateIn={false}) instead of refilling on every cached revisit.
 */

/** The single soft brand wash a dashboard carries — on its Level 1 card. */
const PRIMARY_WASH =
  "bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--brand)_11%,transparent)_0%,transparent_58%)]";

/* ============================== identity ============================== */

/** The large scope title under a management Home's greeting row — the club
 * or the territory — and the page's h1. It wraps rather than truncates, so a
 * long club or city name stays readable; only an extreme multi-city label
 * ("Города: …") is clamped at three lines (/city lists the full scope). */
export function ManagementScope({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <div className="mt-5 px-1">
      <h1 className="line-clamp-3 text-balance text-[26px] font-extrabold leading-[1.15] tracking-tight text-foreground hyphens-auto [overflow-wrap:anywhere]">
        {title}
      </h1>
      {meta && <p className="mt-1 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">{meta}</p>}
    </div>
  );
}

/* ============================== structure ============================== */

/** A titled dashboard group. The heading is deliberately quieter than the
 * numbers it introduces (15px semibold); the optional action is a real
 * 44px-tall tap target. */
export function DashboardSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="-my-2.5 -mr-1 flex min-h-11 shrink-0 items-center gap-0.5 rounded-xl px-1 text-[13px] font-medium text-muted-foreground transition-colors active:text-foreground"
          >
            {action.label}
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** LEVEL 3 — supporting entry points (ManagementListRow children) in one
 * quiet group: outlined, no fill, no shadow, so it never competes with the
 * levels above it. */
export function ManagementLinkGroup({ children }: { children: React.ReactNode }) {
  return (
    <GlassCard variant="outline" pad="none" animateIn={false} className="divide-y divide-border bg-transparent">
      {children}
    </GlassCard>
  );
}

/* ============================== CLUB_MANAGER ============================== */

/** LEVEL 1 for CLUB_MANAGER — today's Daily Plan ("Сегодня · 3 из 9
 * задач"). The whole card opens /plan, as the old Plan row did. A zero-task
 * day says so in words — no "0 из 0", no empty bar. */
export function TodayCard({ summary, onOpen }: { summary: TodaySummary; onOpen: () => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <GlassCard
      variant="solid"
      pad="lg"
      animateIn={false}
      interactive
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={PRIMARY_WASH}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">Сегодня</h2>
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-muted-foreground">
          Открыть план
          <ChevronRight className="size-4" />
        </span>
      </div>
      {summary.kind === "empty" ? (
        <p className="mt-2 text-lg font-bold text-foreground">На сегодня задач нет</p>
      ) : (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[40px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
              {summary.completed}
            </span>
            <span className="text-base font-semibold text-muted-foreground">
              из {summary.total} {pluralRu(summary.total, "задачи", "задач", "задач")}
            </span>
          </p>
          <XPProgress value={summary.ratio} size="md" glow={false} animateIn={false} className="mt-4" />
          {summary.allDone ? (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              Все задачи выполнены
            </p>
          ) : summary.nextTaskTitle ? (
            <p className="mt-3 truncate text-[13px] text-muted-foreground">
              Далее: <span className="font-medium text-foreground">{summary.nextTaskTitle}</span>
            </p>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}

/** LEVEL 2 for CLUB_MANAGER — the team as one management summary: headcount,
 * who is waiting for approval, where training stands, and ONE way in. */
export function TeamSummaryCard({
  employeeCount,
  pendingCount,
  trainingText,
  onOpenTeam,
}: {
  employeeCount: number;
  pendingCount: number;
  trainingText: string;
  onOpenTeam: () => void;
}) {
  return (
    <GlassCard variant="solid" pad="md" animateIn={false}>
      <h2 className="text-[15px] font-semibold text-foreground">Команда</h2>
      {employeeCount > 0 ? (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
              {employeeCount}
            </span>
            <span className="text-sm text-muted-foreground">
              {pluralRu(employeeCount, "сотрудник", "сотрудника", "сотрудников")}
            </span>
          </p>
          {pendingCount > 0 && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {pendingCount} {pluralRu(pendingCount, "ждёт подтверждения", "ждут подтверждения", "ждут подтверждения")}
            </p>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">В команде пока нет сотрудников</p>
      )}
      <div className="mt-4 flex items-start gap-3 border-t border-border pt-4">
        <GraduationCap className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Обучение</p>
          <p className="text-[13px] text-muted-foreground">{trainingText}</p>
        </div>
      </div>
      <Button variant="secondary" size="md" block className="mt-4" onClick={onOpenTeam}>
        Открыть команду
      </Button>
    </GlassCard>
  );
}

/* ============================== CITY_MANAGER ============================== */

/** LEVEL 1 for CITY_MANAGER — the territory in two numbers, plus the
 * training average as a real-percent bar. A scope with no clubs, or with no
 * training average, gets a sentence — never "—", "0/0" or a made-up 0%. */
export function TerritoryOverviewCard({ overview }: { overview: CityOverview | null }) {
  if (!overview) {
    return (
      <GlassCard variant="solid" pad="lg" animateIn={false}>
        <p className="text-[15px] font-semibold text-foreground">В вашей зоне пока нет клубов</p>
      </GlassCard>
    );
  }
  return (
    <GlassCard variant="solid" pad="lg" animateIn={false} className={PRIMARY_WASH}>
      <div className="grid grid-cols-2 gap-4">
        <OverviewMetric value={overview.clubCount} label={pluralRu(overview.clubCount, "клуб", "клуба", "клубов")} />
        <OverviewMetric
          value={overview.employeeCount}
          label={pluralRu(overview.employeeCount, "сотрудник", "сотрудника", "сотрудников")}
        />
      </div>
      <div className="mt-5 border-t border-border pt-4">
        {overview.training ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[13px] font-medium text-muted-foreground">Средний прогресс обучения</p>
              <p className="shrink-0 text-[17px] font-bold tabular-nums text-foreground">{overview.training.averagePercent}%</p>
            </div>
            <XPProgress
              value={overview.training.averagePercent / 100}
              size="sm"
              glow={false}
              animateIn={false}
              className="mt-2.5"
            />
            {overview.training.completedAll > 0 && (
              <p className="mt-2.5 text-[13px] text-muted-foreground">Завершили все уроки: {overview.training.completedAll}</p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Данных по обучению пока нет</p>
        )}
      </div>
    </GlassCard>
  );
}

function OverviewMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-1.5 truncate text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** LEVEL 2 for CITY_MANAGER — the territory club by club: name, an attention
 * marker, who runs it, headcount and training average (only the fields the
 * DTO has); every row opens the existing /city/club drill-down. */
export function TerritoryClubList({
  clubs,
  hiddenCount,
  onOpenClub,
  onOpenAll,
}: {
  clubs: CityManagerHomeClubDTO[];
  hiddenCount: number;
  onOpenClub: (clubId: string) => void;
  onOpenAll: () => void;
}) {
  return (
    <GlassCard variant="solid" pad="none" animateIn={false} className="divide-y divide-border">
      {clubs.map((club) => (
        <TerritoryClubRow key={club.clubId} club={club} onClick={() => onOpenClub(club.clubId)} />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onOpenAll}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] font-semibold text-muted-foreground transition-colors active:bg-foreground/5"
        >
          Ещё {hiddenCount} {pluralRu(hiddenCount, "клуб", "клуба", "клубов")}
          <ChevronRight className="size-4 shrink-0" />
        </button>
      )}
    </GlassCard>
  );
}

function TerritoryClubRow({ club, onClick }: { club: CityManagerHomeClubDTO; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-foreground/5"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">{club.clubName}</span>
          {club.attentionCount > 0 && (
            <Badge variant="brand" className="shrink-0 tabular-nums">
              <span className="sr-only">Требует внимания: </span>
              {club.attentionCount}
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">{club.managerName ?? "Нет управляющего"}</span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <Users className="size-3.5" aria-hidden />
            {club.employeeCount}
            <span className="sr-only"> {pluralRu(club.employeeCount, "сотрудник", "сотрудника", "сотрудников")}</span>
          </span>
          {club.trainingCompletionPercent !== null && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <GraduationCap className="size-3.5" aria-hidden />
              {club.trainingCompletionPercent}%<span className="sr-only"> — прогресс обучения</span>
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}
