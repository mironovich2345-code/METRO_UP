import { ApiError } from "./client";
import type {
  CityManagerDashboardDTO,
  ClubManagerDashboardDTO,
  ClubManagerTeamDTO,
  OperationsDirectorDashboardDTO,
} from "./cabinet-types";

/**
 * Sprint: role-cabinets, step 5 — thin client wrappers for the read-model
 * routes built in step 4 (src/app/api/control/cabinet/*). Same request/ApiError
 * shape as roles-client.ts/knowledge-client.ts — no new fetch convention.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  return data as T;
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const cabinetApi = {
  operationsDirector: () => request<OperationsDirectorDashboardDTO>(`/api/control/cabinet/operations-director`),
  cityManager: () => request<CityManagerDashboardDTO>(`/api/control/cabinet/city-manager`),
  clubManager: (clubId?: string) => request<ClubManagerDashboardDTO>(`/api/control/cabinet/club-manager${qs({ clubId })}`),
  clubManagerTeam: (clubId?: string) => request<ClubManagerTeamDTO>(`/api/control/cabinet/club-manager/team${qs({ clubId })}`),
};

export type {
  AttentionItemDTO,
  CityManagerDashboardDTO,
  CityManagerClubSummaryDTO,
  ClubManagerAssignmentDTO,
  ClubManagerDashboardDTO,
  ClubManagerTeamDTO,
  CabinetTeamMemberDTO,
  OperationsDirectorDashboardDTO,
  TrainingSummaryDTO,
} from "./cabinet-types";
