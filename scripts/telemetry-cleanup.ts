/**
 * Sprint: LIVE QA QA-07 — on-demand 90-day telemetry cleanup.
 *   npm run telemetry:cleanup
 *
 * Deletes MetricUsageEvent / PageViewEvent rows older than 90 days (never
 * Metric conversations/messages). Idempotent. The app also runs the same
 * cleanup opportunistically (at most hourly per process) on telemetry
 * writes; this script is for a manual run or a Railway cron service.
 * Requires DATABASE_URL.
 */
import { cleanupTelemetry } from "../src/lib/telemetry/cleanup-core";
import { telemetryCleanupDb } from "../src/lib/server/telemetry/cleanup";
import { prisma } from "../src/lib/server/db";

async function main() {
  const r = await cleanupTelemetry(telemetryCleanupDb);
  console.info(`[telemetry] cleanup cutoff=${r.cutoff.toISOString()} metricUsage=${r.metricUsage} pageViews=${r.pageViews}`);
}

main()
  .catch((e) => {
    console.error(`[telemetry] cleanup_failed err=${e instanceof Error ? e.message : "unknown"}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
