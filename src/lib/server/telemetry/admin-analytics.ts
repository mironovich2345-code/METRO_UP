import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { periodStart, retentionCutoff, type TelemetryPeriodDays } from "@/lib/telemetry/retention";
import { FREQUENT_QUESTIONS_ROW_BOUND, groupFrequentQuestions } from "@/lib/telemetry/frequent-questions";
import { screenLabel } from "@/lib/telemetry/screens";
import type {
  FrequentMetricQuestionsDTO,
  MetricUsageSummaryDTO,
  UsageBucketDTO,
  VisitBucketDTO,
  VisitSummaryDTO,
} from "@/lib/api/telemetry-types";

/**
 * Sprint: LIVE QA QA-07 — PROJECT_ADMIN telemetry aggregation. Callers MUST
 * gate on requireSystemAccess (the routes do). Every query starts at
 * periodStart(days), which is clamped to the 90-day retention cutoff, and is
 * aggregated in the database — no raw rows reach the browser.
 */

const SURFACE_LABEL: Record<string, string> = { MINI_APP: "Mini App", CONTROL: "Control", SPM: "СПМ" };

interface UsageRow {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pricedCostMicroUsd: number;
  unpricedCalls: number;
}

function usageQuery(since: Date, groupBy: "none" | "model" | "kind") {
  const keyExpr =
    groupBy === "model" ? Prisma.sql`"model"` : groupBy === "kind" ? Prisma.sql`"kind"::text` : Prisma.sql`'all'`;
  const group = groupBy === "none" ? Prisma.empty : Prisma.sql`GROUP BY 1 ORDER BY 2 DESC, 1 ASC`;
  return prisma.$queryRaw<UsageRow[]>`
    SELECT ${keyExpr} AS "key",
           COUNT(*)::int AS "calls",
           COALESCE(SUM("inputTokens"), 0)::float8 AS "inputTokens",
           COALESCE(SUM("outputTokens"), 0)::float8 AS "outputTokens",
           COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
           COALESCE(SUM("costMicroUsd"), 0)::float8 AS "pricedCostMicroUsd",
           COUNT(*) FILTER (WHERE "costMicroUsd" IS NULL)::int AS "unpricedCalls"
      FROM "metric_usage_events"
     WHERE "createdAt" >= ${since}
     ${group}`;
}

function toBucket(r: UsageRow | undefined, key = "all"): UsageBucketDTO {
  return {
    key: r?.key ?? key,
    calls: Number(r?.calls ?? 0),
    inputTokens: Number(r?.inputTokens ?? 0),
    outputTokens: Number(r?.outputTokens ?? 0),
    totalTokens: Number(r?.totalTokens ?? 0),
    pricedCostMicroUsd: Number(r?.pricedCostMicroUsd ?? 0),
    unpricedCalls: Number(r?.unpricedCalls ?? 0),
  };
}

export async function getMetricUsageSummary(days: TelemetryPeriodDays, now: Date = new Date()): Promise<MetricUsageSummaryDTO> {
  const since = periodStart(days, now);
  const [totals, byModel, byKind, first] = await Promise.all([
    usageQuery(since, "none"),
    usageQuery(since, "model"),
    usageQuery(since, "kind"),
    prisma.metricUsageEvent.aggregate({ where: { createdAt: { gte: retentionCutoff(now) } }, _min: { createdAt: true } }),
  ]);
  return {
    days,
    since: since.toISOString(),
    trackingSince: first._min.createdAt?.toISOString() ?? null,
    totals: toBucket(totals[0]),
    byModel: byModel.map((r) => toBucket(r)),
    byKind: byKind.map((r) => toBucket(r)),
  };
}

/**
 * Raw employee prompt text — PROJECT_ADMIN ONLY. Source: MetricMessage rows
 * with role USER (assistant answers, the ephemeral «Продолжить» directive
 * and knowledge sync never are USER messages). Newest first, at most
 * FREQUENT_QUESTIONS_ROW_BOUND rows; grouped by exact normalized text.
 *
 * QA-07.3 — the work Top list counts ONLY scope = IN_SCOPE. OUT_OF_SCOPE is
 * reported separately («Вне рабочих тем»: a count, plus grouped examples on
 * the dedicated page); UNKNOWN (history from before the scope guard) is in
 * neither — it is never guessed.
 */
export async function getFrequentMetricQuestions(
  days: TelemetryPeriodDays,
  limit: number,
  opts: { offTopicExamples?: boolean } = {},
  now: Date = new Date(),
): Promise<FrequentMetricQuestionsDTO> {
  const since = periodStart(days, now);
  const userSince = { role: "USER" as const, createdAt: { gte: since } };
  const scan = (scope: "IN_SCOPE" | "OUT_OF_SCOPE") =>
    prisma.metricMessage.findMany({
      where: { ...userSince, scope },
      orderBy: [{ createdAt: "desc" }, { seq: "desc" }],
      take: FREQUENT_QUESTIONS_ROW_BOUND,
      select: { content: true },
    });
  const [rows, offTopicCount, offTopicRows] = await Promise.all([
    scan("IN_SCOPE"),
    prisma.metricMessage.count({ where: { ...userSince, scope: "OUT_OF_SCOPE" } }),
    opts.offTopicExamples ? scan("OUT_OF_SCOPE") : Promise.resolve([]),
  ]);
  return {
    days,
    since: since.toISOString(),
    questions: groupFrequentQuestions(rows, limit),
    processed: rows.length,
    bounded: rows.length >= FREQUENT_QUESTIONS_ROW_BOUND,
    offTopic: { count: offTopicCount, top: groupFrequentQuestions(offTopicRows, limit) },
  };
}

interface VisitRow {
  key: string;
  views: number;
  uniqueUsers: number;
}

export async function getVisitSummary(days: TelemetryPeriodDays, limit: number, now: Date = new Date()): Promise<VisitSummaryDTO> {
  const since = periodStart(days, now);
  const [totals, bySurface, topScreens, first] = await Promise.all([
    prisma.$queryRaw<Array<{ views: number; uniqueUsers: number }>>`
      SELECT COUNT(*)::int AS "views", COUNT(DISTINCT "userId")::int AS "uniqueUsers"
        FROM "page_view_events" WHERE "createdAt" >= ${since}`,
    prisma.$queryRaw<VisitRow[]>`
      SELECT "surface"::text AS "key", COUNT(*)::int AS "views", COUNT(DISTINCT "userId")::int AS "uniqueUsers"
        FROM "page_view_events" WHERE "createdAt" >= ${since}
       GROUP BY 1 ORDER BY 2 DESC, 1 ASC`,
    prisma.$queryRaw<VisitRow[]>`
      SELECT "screenKey" AS "key", COUNT(*)::int AS "views", COUNT(DISTINCT "userId")::int AS "uniqueUsers"
        FROM "page_view_events" WHERE "createdAt" >= ${since}
       GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT ${limit}`,
    prisma.pageViewEvent.aggregate({ where: { createdAt: { gte: retentionCutoff(now) } }, _min: { createdAt: true } }),
  ]);
  const bucket = (r: VisitRow, label: string): VisitBucketDTO => ({ key: r.key, label, views: Number(r.views), uniqueUsers: Number(r.uniqueUsers) });
  return {
    days,
    since: since.toISOString(),
    trackingSince: first._min.createdAt?.toISOString() ?? null,
    totalViews: Number(totals[0]?.views ?? 0),
    uniqueUsers: Number(totals[0]?.uniqueUsers ?? 0),
    bySurface: bySurface.map((r) => bucket(r, SURFACE_LABEL[r.key] ?? r.key)),
    topScreens: topScreens.map((r) => bucket(r, screenLabel(r.key))),
  };
}
