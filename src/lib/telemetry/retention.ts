/**
 * Sprint: LIVE QA QA-07 — telemetry retention + reporting periods (pure).
 *
 * MetricUsageEvent and PageViewEvent are kept 90 days. Every admin analytics
 * query starts at `periodStart`, which is never earlier than the retention
 * cutoff — so data older than 90 days is excluded even before the physical
 * cleanup (cleanup.ts) has removed it. Metric conversations/messages are NOT
 * covered by this rule.
 */

export const TELEMETRY_RETENTION_DAYS = 90;
export const TELEMETRY_PERIODS = [7, 30] as const;
export type TelemetryPeriodDays = (typeof TELEMETRY_PERIODS)[number];
export const DEFAULT_TELEMETRY_PERIOD: TelemetryPeriodDays = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Events created before this instant are outside retention. */
export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TELEMETRY_RETENTION_DAYS * DAY_MS);
}

/** Rolling window start for a 7/30-day report, clamped to retention. */
export function periodStart(days: TelemetryPeriodDays, now: Date = new Date()): Date {
  const start = new Date(now.getTime() - days * DAY_MS);
  const cutoff = retentionCutoff(now);
  return start < cutoff ? cutoff : start;
}

/** `?days=7` → 7; anything else → the 30-day default. */
export function parsePeriodDays(raw: string | null | undefined): TelemetryPeriodDays {
  return raw === "7" ? 7 : DEFAULT_TELEMETRY_PERIOD;
}
