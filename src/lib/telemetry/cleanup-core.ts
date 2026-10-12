/**
 * Sprint: LIVE QA QA-07 — physical 90-day cleanup of the telemetry tables
 * (pure orchestration; the Prisma calls are injected so it is unit-tested).
 *
 * There is no cron/scheduler in this deployment (railway.json has only a
 * pre-deploy migrate), so cleanup is OPPORTUNISTIC: telemetry writes call
 * maybeCleanup, which runs at most once per CLEANUP_INTERVAL_MS per server
 * process. Idempotent (`createdAt < cutoff` deletes are safe to repeat).
 * Only MetricUsageEvent and PageViewEvent are touched — never Metric
 * conversations or messages. `npm run telemetry:cleanup` runs it on demand.
 */
import { retentionCutoff } from "./retention";

export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface TelemetryCleanupDb {
  deleteMetricUsageBefore(cutoff: Date): Promise<number>;
  deletePageViewsBefore(cutoff: Date): Promise<number>;
}

export async function cleanupTelemetry(db: TelemetryCleanupDb, now: Date = new Date()) {
  const cutoff = retentionCutoff(now);
  const [metricUsage, pageViews] = await Promise.all([db.deleteMetricUsageBefore(cutoff), db.deletePageViewsBefore(cutoff)]);
  return { cutoff, metricUsage, pageViews };
}

/** Throttle: true when a cleanup should start now (and records that it did). */
export function createCleanupThrottle(intervalMs: number = CLEANUP_INTERVAL_MS) {
  let lastRun = -Infinity;
  return (nowMs: number = Date.now()): boolean => {
    if (nowMs - lastRun < intervalMs) return false;
    lastRun = nowMs;
    return true;
  };
}
