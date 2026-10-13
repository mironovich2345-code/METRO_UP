/**
 * Sprint: LIVE QA QA-07 — pure presentation rules for the PROJECT_ADMIN
 * telemetry cards/pages (unit-tested). The key rule: unpriced usage is NEVER
 * shown as $0.
 */
import { formatMicroUsd } from "@/lib/telemetry/metric-pricing";
import type { UsageBucketDTO } from "@/lib/api/telemetry-types";

export const TELEMETRY_PERIOD_OPTIONS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
] as const;

export const METRIC_USAGE_KIND_LABEL: Record<string, string> = {
  CHAT: "Ответы сотрудникам",
  CONTINUE: "«Продолжить» ответа",
  SCOPE_CHECK: "Проверка темы вопроса",
};

export function usageKindLabel(kind: string): string {
  return METRIC_USAGE_KIND_LABEL[kind] ?? kind;
}

/** 1234567 → "1 234 567" (narrow no-break spaces; never overflows as one blob). */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

export interface CostView {
  /** "$1.23" | "Стоимость пока недоступна" | "Запросов не было". */
  headline: string;
  /** True when headline is money. */
  priced: boolean;
  /** "Не рассчитано для N запросов" when part of the usage has no price. */
  unpricedNote: string | null;
}

export function describeCost(b: Pick<UsageBucketDTO, "calls" | "unpricedCalls" | "pricedCostMicroUsd">): CostView {
  if (b.calls === 0) return { headline: "Запросов не было", priced: false, unpricedNote: null };
  if (b.unpricedCalls >= b.calls) return { headline: "Стоимость пока недоступна", priced: false, unpricedNote: null };
  return {
    headline: formatMicroUsd(b.pricedCostMicroUsd),
    priced: true,
    unpricedNote: b.unpricedCalls > 0 ? `Не рассчитано для ${formatCount(b.unpricedCalls)} ${pluralRequests(b.unpricedCalls)}` : null,
  };
}

/** Russian plural for «запрос». */
export function pluralRequests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запроса";
  return "запросов";
}

/** «запрос / запроса / запросов» for a count shown as a subject ("12 запросов"). */
export function requestsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запрос";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "запроса";
  return "запросов";
}

/** «раз» is invariant in Russian («1 раз», «17 раз»). */
export function timesLabel(n: number): string {
  return `${formatCount(n)} раз`;
}

/** Honest boundary: tracking started inside the selected period. */
export function trackingNote(trackingSince: string | null, since: string): string | null {
  if (!trackingSince) return "Учёт ведётся с момента обновления — данных пока нет";
  if (new Date(trackingSince) > new Date(since)) {
    const d = new Date(trackingSince);
    return `Учёт ведётся с ${d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
  }
  return null;
}

/** QA-07.3 — «Вне рабочих тем»: "0 запросов", "1 запрос", "3 запроса". */
export function offTopicCountLabel(n: number): string {
  return `${formatCount(n)} ${requestsWord(n)}`;
}
