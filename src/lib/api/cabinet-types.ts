import type { AccessStatusDTO, PositionDTO } from "./types";
import type { DailyPlanDTO } from "./home-types";

/**
 * Sprint: role-cabinets, step 4 — SERVER READ MODELS for the
 * OPERATIONS_DIRECTOR / CITY_MANAGER / CLUB_MANAGER cabinets. No UI consumes
 * these yet; this file is the versioned contract between the read-model
 * services (src/lib/server/rbac/cabinet-dashboards.ts) and whatever renders
 * them next.
 *
 * IMPORTANT — training/Academy semantics (see cabinet-dashboards.ts's header
 * comment for the full reasoning): Academy Audience does not exist yet.
 * `TrainingSummaryDTO` and every `trainingCompletionPercent` /
 * `academy.progressPercent` field below describe completion against the
 * SAME global set of PUBLISHED lessons for every employee — there is no
 * "required for your position/city/club" subset, no due date, no "overdue"
 * concept. Treat these as an honest "how much of the shared curriculum is
 * done" signal, never as "compliance" or "assigned training status".
 */

export type AttentionCategoryDTO =
  | "CITY_WITHOUT_CITY_MANAGER"
  | "CLUB_WITHOUT_CLUB_MANAGER"
  | "PENDING_EMPLOYEE_APPROVAL";

export type AttentionEntityTypeDTO = "city" | "club" | "employee";

/** One actionable item. `entityId`/`cityId`/`clubId` carry enough to
 * navigate to (or scope a follow-up query about) the affected entity — never
 * more employee detail than a display name. */
export interface AttentionItemDTO {
  category: AttentionCategoryDTO;
  entityType: AttentionEntityTypeDTO;
  entityId: string;
  entityName: string;
  cityId: string | null;
  clubId: string | null;
}

/** Aggregate completion against the current global PUBLISHED-lesson set.
 * `null` fields mean "cannot be honestly computed right now" (e.g. zero
 * published lessons, or zero employees in scope) — never a fabricated 0. */
export interface TrainingSummaryDTO {
  /** Denominator used for every percent below — same for every employee,
   * system-wide, today. */
  totalPublishedLessons: number;
  /** employeeCount this was computed over (0 employees -> percent is null). */
  employeeCount: number;
  /** Mean of each employee's own (completedLessons / totalPublishedLessons),
   * as a 0-100 percent, or null if totalPublishedLessons = 0 or
   * employeeCount = 0. */
  averageProgressPercent: number | null;
  /** Employees whose completedLessons = totalPublishedLessons (only
   * meaningful, i.e. only counted, when totalPublishedLessons > 0). */
  employeesCompletedAll: number;
}

export interface CityManagerRefDTO {
  userId: string;
  displayName: string;
}

export interface OperationsDirectorSummaryDTO {
  cityCount: number;
  clubCount: number;
  employeeCount: number;
  /** Active RoleAssignment rows with role=CITY_MANAGER, system-wide — a
   * count of ASSIGNMENTS, not unique people (one person could theoretically
   * hold two, though the UI has no flow that produces that today). */
  cityManagerCount: number;
  pendingApprovalCount: number;
}

export interface OperationsDirectorCitySummaryDTO {
  cityId: string;
  cityName: string;
  clubCount: number;
  employeeCount: number;
  /** Multiple CITY_MANAGER assignments MAY cover one city — never assumed
   * to be 0 or 1. */
  activeCityManagerCount: number;
  cityManagers: CityManagerRefDTO[];
  pendingApprovalCount: number;
  attentionCount: number;
  trainingCompletionPercent: number | null;
}

export interface OperationsDirectorDashboardDTO {
  summary: OperationsDirectorSummaryDTO;
  /** null only if there are zero PUBLISHED lessons in the system at all —
   * see TrainingSummaryDTO's doc comment. */
  training: TrainingSummaryDTO | null;
  attention: AttentionItemDTO[];
  cities: OperationsDirectorCitySummaryDTO[];
}

export interface CityManagerSummaryDTO {
  clubCount: number;
  employeeCount: number;
  /** Active CLUB_MANAGER assignments inside this CITY_MANAGER's effective
   * scope. */
  clubManagerCount: number;
  pendingApprovalCount: number;
}

export interface CityManagerClubSummaryDTO {
  clubId: string;
  clubName: string;
  cityId: string;
  cityName: string | null;
  employeeCount: number;
  /** null when the club currently has no active CLUB_MANAGER — this is
   * also what drives the CLUB_WITHOUT_CLUB_MANAGER attention item. */
  activeClubManager: CityManagerRefDTO | null;
  pendingApprovalCount: number;
  attentionCount: number;
  trainingCompletionPercent: number | null;
}

/** One active CLUB_MANAGER RoleAssignment inside a CITY_MANAGER's scope —
 * enough to render a list and act on it later, no unrelated personal data. */
export interface ClubManagerAssignmentDTO {
  assignmentId: string;
  userId: string;
  displayName: string;
  clubId: string;
  clubName: string;
  startedAt: string;
  status: "ACTIVE";
}

export interface CityManagerDashboardDTO {
  summary: CityManagerSummaryDTO;
  training: TrainingSummaryDTO | null;
  attention: AttentionItemDTO[];
  clubs: CityManagerClubSummaryDTO[];
  clubManagers: ClubManagerAssignmentDTO[];
}

export interface ClubManagerSummaryDTO {
  employeeCount: number;
  pendingApprovalCount: number;
}

/** Only what can be honestly derived today (see TrainingSummaryDTO) —
 * "in training" = at least one completed lesson but not all of them;
 * "completed" = all currently-published lessons done. Both are 0 when
 * totalPublishedLessons = 0 (nothing to be "in training" toward). */
export interface ClubTrainingSummaryDTO {
  totalPublishedLessons: number;
  employeesInTraining: number;
  employeesCompleted: number;
}

export interface AcademyMemberSummaryDTO {
  /** 0-100, or null if totalPublishedLessons = 0 (nothing to divide by). */
  progressPercent: number | null;
  latestTestResult: { scorePercent: number; passed: boolean; completedAt: string | null } | null;
}

export interface CabinetTeamMemberDTO {
  userId: string;
  displayName: string;
  position: string | null;
  accessStatus: AccessStatusDTO;
  onboardingCompleted: boolean;
  academy: AcademyMemberSummaryDTO;
}

export interface ClubManagerDashboardDTO {
  clubId: string;
  clubName: string | null;
  summary: ClubManagerSummaryDTO;
  training: ClubTrainingSummaryDTO | null;
  attention: AttentionItemDTO[];
  /** The ACTING manager's own Daily Plan, via the existing, unmodified
   * getPlanTodayFor — null only when there is no acting-user context to
   * compute it for (never fabricated). */
  plan: DailyPlanDTO | null;
}

export interface ClubManagerTeamDTO {
  clubId: string;
  clubName: string | null;
  members: CabinetTeamMemberDTO[];
}

/** Re-exported for convenience so cabinet-dashboards.ts's callers don't also
 * need to import from ./types directly. */
export type { PositionDTO };
