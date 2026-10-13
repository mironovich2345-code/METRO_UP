"use client";

import { useState } from "react";
import { controlAdminApi } from "@/lib/api/control-admin-client";
import type { TelemetryPeriodDays, UsageBucketDTO } from "@/lib/api/telemetry-types";
import { describeCost, formatCount, offTopicCountLabel, requestsWord, usageKindLabel } from "@/lib/control/telemetry-view";
import { FREQUENT_QUESTIONS_ROW_BOUND } from "@/lib/telemetry/frequent-questions";
import { FrequentQuestionsList, MetricCostBody, PeriodToggle, usePeriodData } from "./TelemetryCards";

const loadUsage = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.metricUsage(d, s);
const loadQuestions = (d: TelemetryPeriodDays, s: AbortSignal) => controlAdminApi.metricQuestions(d, 10, s);

/**
 * Sprint: LIVE QA QA-07 — «Расходы Метрика» (PROJECT_ADMIN only): totals,
 * breakdown by model and by operation, and the top-10 frequent employee
 * questions for the same 7/30-day period. Cards, not a wide table — readable
 * from 320px. Unpriced usage is labelled as such, never $0.
 */
export function MetricUsageAdmin() {
  const [days, setDays] = useState<TelemetryPeriodDays>(30);
  const usage = usePeriodData(loadUsage, days);
  const questions = usePeriodData(loadQuestions, days);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Расходы Метрика</h1>
          <p className="mt-1 text-sm text-muted-foreground">Запросы к ИИ-провайдеру: токены и стоимость на момент запроса.</p>
        </div>
        <PeriodToggle value={days} onChange={setDays} />
      </div>

      <section className="rounded-3xl border border-border bg-card p-5">
        {usage.data ? (
          <MetricCostBody data={usage.data} />
        ) : (
          <p className="text-sm text-muted-foreground">{usage.error ? "Не удалось загрузить расходы." : "Загрузка…"}</p>
        )}
        {/* QA-07.1 — vector-store storage is billed separately and not recorded. */}
        <p className="mt-3 text-xs text-muted-foreground">Хранение базы знаний в стоимость пока не включено.</p>
      </section>

      {usage.data && usage.data.totals.calls > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Breakdown title="По моделям" rows={usage.data.byModel} label={(k) => k} />
          <Breakdown title="По операциям" rows={usage.data.byKind} label={usageKindLabel} />
        </div>
      )}

      <section id="questions" className="scroll-mt-24 rounded-3xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold">Частые вопросы Метрику</h2>
        <p className="mt-1 text-sm text-muted-foreground">Только рабочие вопросы. Точные совпадения после нормализации регистра, пробелов и знаков препинания.</p>
        <div className="mt-4">
          {questions.data ? (
            <>
              <FrequentQuestionsList data={questions.data} />
              {questions.data.bounded && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Учтены последние {formatCount(FREQUENT_QUESTIONS_ROW_BOUND)} вопросов за период.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{questions.error ? "Не удалось загрузить вопросы." : "Загрузка…"}</p>
          )}
        </div>
      </section>

      {questions.data && (
        <section id="off-topic" className="scroll-mt-24 rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">Вне рабочих тем</h2>
            <p className="text-sm font-bold tabular-nums">{offTopicCountLabel(questions.data.offTopic.count)}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Вопросы, на которые Метрик не отвечал: не относятся к работе.</p>
          {questions.data.offTopic.top.length > 0 && (
            <div className="mt-4">
              <FrequentQuestionsList data={{ ...questions.data, questions: questions.data.offTopic.top }} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Breakdown({ title, rows, label }: { title: string; rows: UsageBucketDTO[]; label: (key: string) => string }) {
  return (
    <section className="min-w-0 rounded-3xl border border-border bg-card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {rows.map((r) => {
          const cost = describeCost(r);
          return (
            <li key={r.key} className="flex flex-col gap-1 py-3 first:pt-0">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">{label(r.key)}</p>
                <p className={cost.priced ? "shrink-0 font-bold tabular-nums" : "shrink-0 text-right text-xs text-muted-foreground"}>
                  {cost.priced ? cost.headline : "Цена не настроена"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {formatCount(r.calls)} {requestsWord(r.calls)} · вход {formatCount(r.inputTokens)} · выход {formatCount(r.outputTokens)} токенов
              </p>
              {cost.unpricedNote && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{cost.unpricedNote}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
