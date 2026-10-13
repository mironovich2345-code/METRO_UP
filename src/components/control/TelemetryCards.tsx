"use client";

import { useEffect, useState } from "react";
import { BarChart3, MessageCircleQuestion, Wallet } from "lucide-react";
import { controlAdminApi } from "@/lib/api/control-admin-client";
import type {
  FrequentMetricQuestionsDTO,
  MetricUsageSummaryDTO,
  TelemetryPeriodDays,
  VisitSummaryDTO,
} from "@/lib/api/telemetry-types";
import {
  TELEMETRY_PERIOD_OPTIONS,
  describeCost,
  formatCount,
  offTopicCountLabel,
  timesLabel,
  trackingNote,
} from "@/lib/control/telemetry-view";
import { cn } from "@/lib/utils";
import { DashboardCard, DashboardMoreLink, DashboardStat } from "./dashboard-card";

/**
 * Sprint: LIVE QA QA-07 — PROJECT_ADMIN telemetry on Control Home: one shared
 * 7/30-day period for the three cards (the «Логи» card keeps its own rolling
 * 5 minutes; «Вопросы сотрудников» keeps its semantics). Every number is
 * aggregated on the server from recorded events; unpriced usage is never
 * shown as $0. Only rendered for system access (ControlDashboard), and the
 * APIs themselves are requireSystemAccess.
 */

export function PeriodToggle({ value, onChange }: { value: TelemetryPeriodDays; onChange: (d: TelemetryPeriodDays) => void }) {
  return (
    <div role="group" aria-label="Период" className="inline-flex shrink-0 rounded-2xl border border-border bg-card p-1">
      {TELEMETRY_PERIOD_OPTIONS.map((o) => (
        <button
          key={o.days}
          type="button"
          aria-pressed={value === o.days}
          onClick={() => onChange(o.days)}
          className={cn(
            "min-h-9 rounded-xl px-3 text-sm font-semibold transition-colors",
            value === o.days ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Fetch for the current period; keeps the previous result visible while the next loads. */
export function usePeriodData<T>(load: (days: TelemetryPeriodDays, signal: AbortSignal) => Promise<T>, days: TelemetryPeriodDays) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    load(days, controller.signal)
      .then(setData)
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, [load, days]); // `load` is a stable module-level function at every call site
  return { data, error };
}

const loadUsage = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.metricUsage(d, s);
const loadQuestionsTop5 = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.metricQuestions(d, 5, s);
const loadVisitsTop5 = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.visits(d, 5, s);

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{children}</p>;
}

export function MetricCostBody({ data }: { data: MetricUsageSummaryDTO }) {
  const t = data.totals;
  const cost = describeCost(t);
  const note = trackingNote(data.trackingSince, data.since);
  return (
    <div className="flex flex-col gap-3">
      <p className={cn("font-bold [overflow-wrap:anywhere]", cost.priced ? "text-3xl tabular-nums" : "text-lg")}>{cost.headline}</p>
      {cost.unpricedNote && <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{cost.unpricedNote}</p>}
      {/* Label/value rows: a 12-digit token count never breaks mid-number. */}
      <dl className="flex flex-col divide-y divide-border">
        <StatRow label="Запросы" value={formatCount(t.calls)} />
        <StatRow label="Входные токены" value={formatCount(t.inputTokens)} />
        <StatRow label="Выходные токены" value={formatCount(t.outputTokens)} />
      </dl>
      {note && <Muted>{note}</Muted>}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="min-w-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="shrink-0 text-base font-bold tabular-nums">{value}</dd>
    </div>
  );
}

export function MetricCostCard({ days }: { days: TelemetryPeriodDays }) {
  const { data, error } = usePeriodData(loadUsage, days);
  return (
    <DashboardCard icon={Wallet} title="Расходы Метрика" footer={<DashboardMoreLink href="/control/metric-usage">Подробнее</DashboardMoreLink>}>
      {data ? <MetricCostBody data={data} /> : <Muted>{error ? "Не удалось загрузить расходы." : "Загрузка…"}</Muted>}
    </DashboardCard>
  );
}

export function FrequentQuestionsList({ data }: { data: FrequentMetricQuestionsDTO }) {
  if (data.questions.length === 0) return <Muted>За выбранный период вопросов пока нет</Muted>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {data.questions.map((q, i) => (
        <li key={`${i}-${q.question}`} className="flex gap-3 py-2 first:pt-0">
          <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{i + 1}.</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold [overflow-wrap:anywhere]">{q.question}</p>
            <p className="text-xs text-muted-foreground">{timesLabel(q.count)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** QA-07.3 — the count of OUT_OF_SCOPE prompts only (no raw text on Home). */
export function OffTopicCount({ count }: { count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
      <p className="min-w-0 text-sm text-muted-foreground">Вне рабочих тем</p>
      <p className="shrink-0 text-sm font-bold tabular-nums">{offTopicCountLabel(count)}</p>
    </div>
  );
}

export function FrequentQuestionsCard({ days }: { days: TelemetryPeriodDays }) {
  const { data, error } = usePeriodData(loadQuestionsTop5, days);
  return (
    <DashboardCard
      icon={MessageCircleQuestion}
      title="Частые вопросы Метрику"
      footer={<DashboardMoreLink href="/control/metric-usage#questions">Все частые вопросы</DashboardMoreLink>}
    >
      {data ? (
        <div className="flex flex-col gap-3">
          <FrequentQuestionsList data={data} />
          <OffTopicCount count={data.offTopic.count} />
        </div>
      ) : (
        <Muted>{error ? "Не удалось загрузить вопросы." : "Загрузка…"}</Muted>
      )}
    </DashboardCard>
  );
}

export function ScreenList({ rows }: { rows: VisitSummaryDTO["topScreens"] }) {
  if (rows.length === 0) return <Muted>За выбранный период посещений пока нет</Muted>;
  return (
    <ol className="flex flex-col divide-y divide-border">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-start gap-3 py-2 first:pt-0">
          <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{i + 1}.</span>
          <p className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{r.label}</p>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold tabular-nums">{formatCount(r.views)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatCount(r.uniqueUsers)} чел.</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VisitsBody({ data }: { data: VisitSummaryDTO }) {
  const note = trackingNote(data.trackingSince, data.since);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <DashboardStat label="просмотров экранов" value={formatCount(data.totalViews)} />
        <DashboardStat label="уникальных пользователей" value={formatCount(data.uniqueUsers)} />
      </div>
      <ScreenList rows={data.topScreens} />
      {note && <Muted>{note}</Muted>}
    </div>
  );
}

export function VisitsCard({ days }: { days: TelemetryPeriodDays }) {
  const { data, error } = usePeriodData(loadVisitsTop5, days);
  return (
    <DashboardCard icon={BarChart3} title="Посещаемость" footer={<DashboardMoreLink href="/control/visits">Подробнее</DashboardMoreLink>}>
      {data ? <VisitsBody data={data} /> : <Muted>{error ? "Не удалось загрузить посещаемость." : "Загрузка…"}</Muted>}
    </DashboardCard>
  );
}

export function TelemetrySection() {
  const [days, setDays] = useState<TelemetryPeriodDays>(30);
  return (
    <section className="mt-8" aria-labelledby="telemetry-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="telemetry-title" className="text-lg font-bold">
          Использование
        </h2>
        <PeriodToggle value={days} onChange={setDays} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetricCostCard days={days} />
        <FrequentQuestionsCard days={days} />
        <VisitsCard days={days} />
      </div>
    </section>
  );
}
