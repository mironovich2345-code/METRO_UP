import { ApiError } from "./client";
import type { EmployeeQuestionDTO } from "./questions-types";
import type { FrequentMetricQuestionsDTO, MetricUsageSummaryDTO, TelemetryPeriodDays, VisitSummaryDTO } from "./telemetry-types";

/** Sprint: LIVE QA QA-06 — PROJECT_ADMIN-only Control reads. */
export interface AdminAuditLogRow {
  id: string;
  actorUserId: string;
  targetUserId: string;
  action: string;
  clubId: string | null;
  cityId: string | null;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
  targetName: string | null;
  clubName: string | null;
  cityName: string | null;
}

export interface AdminAuditLogPage {
  rows: AdminAuditLogRow[];
  page: number;
  limit: number;
  total: number;
}

export interface AdminQuestionsSummary {
  newCount: number;
  inProgressCount: number;
  latest: EmployeeQuestionDTO[];
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? "error");
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const controlAdminApi = {
  logs: (filter: { action?: string; sinceMinutes?: number; page?: number; limit?: number } = {}, signal?: AbortSignal) =>
    get<AdminAuditLogPage>(`/api/control/logs${qs(filter)}`, signal),
  questionsSummary: (signal?: AbortSignal) => get<AdminQuestionsSummary>("/api/control/admin/questions-summary", signal),
  // Sprint: LIVE QA QA-07 — telemetry (PROJECT_ADMIN only on the server).
  metricUsage: (days: TelemetryPeriodDays, signal?: AbortSignal) =>
    get<MetricUsageSummaryDTO>(`/api/control/admin/metric-usage${qs({ days })}`, signal),
  metricQuestions: (days: TelemetryPeriodDays, limit: 5 | 10, signal?: AbortSignal) =>
    get<FrequentMetricQuestionsDTO>(`/api/control/admin/metric-questions${qs({ days, limit })}`, signal),
  visits: (days: TelemetryPeriodDays, limit: 5 | 20, signal?: AbortSignal) =>
    get<VisitSummaryDTO>(`/api/control/admin/visits${qs({ days, limit })}`, signal),
};
