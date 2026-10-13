/**
 * Sprint: LIVE QA QA-07 — PROJECT_ADMIN telemetry read DTOs (client-safe).
 * Money is integer micro-USD (1 = 0.000001 USD); null = no priced call.
 */
export type TelemetryPeriodDays = 7 | 30;

export interface UsageBucketDTO {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Sum over PRICED calls only. */
  pricedCostMicroUsd: number;
  unpricedCalls: number;
}

export interface MetricUsageSummaryDTO {
  days: TelemetryPeriodDays;
  since: string;
  /** Oldest retained usage event (null = nothing recorded yet) — the honest
   * start of tracking; nothing before it is reconstructed. */
  trackingSince: string | null;
  totals: UsageBucketDTO;
  byModel: UsageBucketDTO[];
  byKind: UsageBucketDTO[];
}

export interface FrequentMetricQuestionsDTO {
  days: TelemetryPeriodDays;
  since: string;
  questions: Array<{ question: string; count: number }>;
  /** USER prompts scanned (newest first) and whether the bound was reached. */
  processed: number;
  bounded: boolean;
  /** QA-07.3 — «Вне рабочих тем»: OUT_OF_SCOPE prompts in the period. `top`
   * (grouped examples) is filled only for the dedicated page. */
  offTopic: { count: number; top: Array<{ question: string; count: number }> };
}

export interface VisitBucketDTO {
  key: string;
  label: string;
  views: number;
  uniqueUsers: number;
}

export interface VisitSummaryDTO {
  days: TelemetryPeriodDays;
  since: string;
  trackingSince: string | null;
  totalViews: number;
  uniqueUsers: number;
  bySurface: VisitBucketDTO[];
  topScreens: VisitBucketDTO[];
}
