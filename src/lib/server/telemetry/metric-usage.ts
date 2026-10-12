import "server-only";
import { prisma } from "../db";
import { recordMetricUsageSafely, type MetricUsageEventInput } from "@/lib/telemetry/metric-usage-core";
import { maybeCleanupTelemetry } from "./cleanup";

/**
 * Sprint: LIVE QA QA-07 — persist one Metric provider call. Never throws:
 * a failed telemetry write must not turn a successful answer into an error.
 */
export async function recordMetricUsage(event: MetricUsageEventInput): Promise<void> {
  await recordMetricUsageSafely((data) => prisma.metricUsageEvent.create({ data, select: { id: true } }), event);
  maybeCleanupTelemetry();
}
