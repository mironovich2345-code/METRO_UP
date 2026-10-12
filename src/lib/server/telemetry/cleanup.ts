import "server-only";
import { prisma } from "../db";
import { cleanupTelemetry, createCleanupThrottle, type TelemetryCleanupDb } from "@/lib/telemetry/cleanup-core";

export const telemetryCleanupDb: TelemetryCleanupDb = {
  async deleteMetricUsageBefore(cutoff) {
    return (await prisma.metricUsageEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  },
  async deletePageViewsBefore(cutoff) {
    return (await prisma.pageViewEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  },
};

const shouldRun = createCleanupThrottle();

/** Fire-and-forget, at most once an hour per process (see cleanup-core.ts). */
export function maybeCleanupTelemetry(): void {
  if (!shouldRun()) return;
  cleanupTelemetry(telemetryCleanupDb).catch((e: unknown) => {
    console.error(`[telemetry] cleanup_failed err=${e instanceof Error ? e.name : "unknown"}`);
  });
}
