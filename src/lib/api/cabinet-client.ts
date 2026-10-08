import { ApiError } from "./client";
import type { ClubSummaryDTO } from "./roles-client";
import type {
  AssignCityManagerTaskResultDTO,
  CityManagerDashboardDTO,
  CityManagerTrainingClubRowDTO,
  ClubManagerDashboardDTO,
  ClubManagerTaskStatusDTO,
  ClubManagerTeamDTO,
  ManagementEmployeeCardDTO,
  ManagerDelegatedTaskDTO,
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
  /** Sprint: role-cabinets, step 6 — the clubs the caller personally manages
   * (GET /api/control/club/clubs). Zero, one, or several — never assumed. */
  myManagedClubs: () => request<{ clubs: ClubSummaryDTO[] }>(`/api/control/club/clubs`),
  /** Sprint: manual-test-round-3, section 5A — CITY_MANAGER-only club-level
   * training rows. */
  cityManagerTraining: () => request<{ clubs: CityManagerTrainingClubRowDTO[] }>(`/api/control/cabinet/city-manager/training`),
  /** Sprint: manual-test-round-3, sections 5C/5D; Management Round E1 — the
   * shared, role-agnostic management Employee Card (CITY_MANAGER and
   * CLUB_MANAGER alike, future OPERATIONS_DIRECTOR reuses the same shape).
   * Same URL as before Round E1 — only the response got richer. */
  employeeTraining: (userId: string) => request<ManagementEmployeeCardDTO>(`/api/control/cabinet/employee-training${qs({ userId })}`),
  /** Management Round E2 — CITY_MANAGER -> CLUB_MANAGER Daily Plan
   * delegation. Body carries only clubId/date/title; the server resolves
   * and validates the target, scope, and every other field itself. */
  assignCityManagerTask: (body: { clubId: string; date: string; title: string }) =>
    request<AssignCityManagerTaskResultDTO>(`/api/control/cabinet/city-manager/assign-task`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** The compact "Задачи" status for one club's active manager — null when
   * the club has no active manager to report on. */
  clubManagerTaskStatus: (clubId: string) =>
    request<ClubManagerTaskStatusDTO | null>(`/api/control/cabinet/city-manager/club-task-status${qs({ clubId })}`),
  /** Management Round E2.1 — the actual delegated-task rows (text/date/
   * completion) THIS CITY_MANAGER assigned to the club's active manager.
   * Distinct from clubManagerTaskStatus above, which is just the
   * manager's total today count across their whole Daily Plan. */
  cityManagerDelegatedTasks: (clubId: string) =>
    request<ManagerDelegatedTaskDTO[]>(`/api/control/cabinet/city-manager/delegated-tasks${qs({ clubId })}`),
};

export type {
  AssignCityManagerTaskResultDTO,
  AttentionItemDTO,
  CityManagerDashboardDTO,
  CityManagerClubSummaryDTO,
  CityManagerTrainingClubRowDTO,
  ClubManagerAssignmentDTO,
  ClubManagerDashboardDTO,
  ClubManagerTaskStatusDTO,
  ClubManagerTeamDTO,
  CabinetTeamMemberDTO,
  ManagementEmployeeCardDTO,
  ManagementEmployeeEmploymentDTO,
  ManagementEmployeeMysteryResultDTO,
  ManagementEmployeeProfileDTO,
  ManagementEmployeeTestSummaryDTO,
  ManagerDelegatedTaskDTO,
  OperationsDirectorDashboardDTO,
  TrainingSummaryDTO,
} from "./cabinet-types";
export type { EmployeeTrainingDetailDTO, EmployeeTrainingProgramDTO, EmployeeTrainingLessonDTO } from "./content-types";
