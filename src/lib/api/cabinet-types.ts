import type { AccessStatusDTO, PositionDTO } from "./types";
import type { DailyPlanDTO, DailyTaskStatusDTO } from "./home-types";
import type { EmployeeTrainingProgramDTO } from "./content-types";

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

/**
 * Sprint: manual-test-round-3, section 5A — "Обучение по клубам" drill-down,
 * one row per club in the CITY_MANAGER's effective scope. Same honest
 * semantics as everywhere else in this file (see cabinet-dashboards.ts's own
 * header comment): never "mandatory"/"overdue", just real completed/
 * published-lesson counts. null averageProgressPercent when there's no
 * published content or no employees to average over — never fabricated.
 */
export interface CityManagerTrainingClubRowDTO {
  clubId: string;
  clubName: string;
  employeeCount: number;
  averageProgressPercent: number | null;
  employeesCompletedAll: number;
  employeesInTraining: number;
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
  /**
   * Sprint: role-cabinets, step 6, sections 16-17 — true only when this
   * response was served via an active View-As-CLUB_MANAGER preview
   * (resolveClubManagerCabinetAccess's tier 1). The UI uses this to HIDE
   * mutation controls (approve, plan interactions) during a preview — never
   * to decide whether a mutation is ALLOWED, which the server (real-actor
   * authorization + the global View-As middleware) always decides
   * independently regardless of what this flag says.
   */
  isPreviewing: boolean;
}

export interface ClubManagerTeamDTO {
  clubId: string;
  clubName: string | null;
  members: CabinetTeamMemberDTO[];
}

/** Re-exported for convenience so cabinet-dashboards.ts's callers don't also
 * need to import from ./types directly. */
export type { PositionDTO };

/* ============================================================================
 * Management Round E1 — ONE shared employee read model, used identically by
 * CLUB_MANAGER (own club only) and CITY_MANAGER (effective scope) alike —
 * authorization decides WHICH employee this can be requested for; the shape
 * returned once authorized never differs by role. Future OPERATIONS_DIRECTOR
 * reuses this same shape unchanged. Every section is independently
 * nullable/empty rather than ever fabricated — see each field's own comment.
 * ============================================================================
 */

export interface ManagementEmployeeProfileDTO {
  displayName: string;
  /** Signed/public URL for the custom uploaded avatar — never a storage key.
   * Null = no custom avatar; the client falls back to initials, same as
   * every other avatar in this app (never telegramPhotoUrl). */
  avatarUrl: string | null;
  position: string | null;
  clubName: string | null;
  cityName: string | null;
}

/** `startedAt` is null whenever this employee has no OPEN (endedAt: null)
 * EmploymentAssignment row — which is EVERY employee today, since nothing
 * in this codebase writes to that table yet (Round E0's audit finding).
 * NEVER derived from User.createdAt. The client shows a calm "not set"
 * copy when null, never a fabricated 0-day tenure. */
export interface ManagementEmployeeEmploymentDTO {
  startedAt: string | null;
}

/** One row per quiz this employee has ever attempted — never per lesson
 * (a lesson may have no quiz at all), and never including QuizOption.isCorrect
 * or raw attempt `answers` (section 8's explicit "never expose correct
 * answers"). `latestPercent`/`passed` reflect the most recent attempt by
 * startedAt (same "most recent wins" convention cabinet-dashboards.ts's own
 * loadLatestQuizResults already uses); `bestPercent` is MAX(scorePercent)
 * across every attempt, independent of recency. */
export interface ManagementEmployeeTestSummaryDTO {
  quizId: string;
  title: string;
  passed: boolean;
  latestPercent: number;
  bestPercent: number;
  lastAttemptAt: string;
  attemptCount: number;
}

/** One PUBLISHED MysteryShopperResult row — DRAFT rows (SPM still working on
 * it) never reach this DTO at all, not even to be hidden client-side.
 * `periodLabel` matches the EXISTING MysterySummaryDTO convention exactly
 * (getMysterySummary, src/lib/server/mystery.ts: ruMonthYear(month, year))
 * — the server computes it once, the client never reformats raw month/year
 * itself. `comment` is carried through for an expanded/detail view
 * (section 10's "show them only in detail where appropriate") — the
 * compact card itself only needs period+score. */
export interface ManagementEmployeeMysteryResultDTO {
  periodLabel: string;
  score: number;
  comment: string | null;
}

export interface ManagementEmployeeCardDTO {
  profile: ManagementEmployeeProfileDTO;
  employment: ManagementEmployeeEmploymentDTO;
  /** Reuses getEmployeeTrainingDetail's existing overall/programs shape
   * unchanged (no due dates/overdue/mandatory status — none of that exists
   * in the content model); displayName/position live in `profile` instead,
   * never duplicated here. */
  learning: { overall: { completed: number; total: number }; programs: EmployeeTrainingProgramDTO[] };
  /** Empty array (never null) when this employee has no QuizAttempt rows at
   * all — the client shows an honest "Не проходил", not a fabricated row. */
  tests: ManagementEmployeeTestSummaryDTO[];
  mysteryShopper: {
    /** Same row as history[0] when history is non-empty; null when empty —
     * never recomputed differently from the history list. */
    latest: ManagementEmployeeMysteryResultDTO | null;
    history: ManagementEmployeeMysteryResultDTO[];
  };
}

/* ============================================================================
 * Management Round E2 — CITY_MANAGER -> CLUB_MANAGER Daily Plan delegation
 * (src/lib/server/city-plan.ts). The target CLUB_MANAGER and club are
 * ALWAYS server-resolved from an authorized clubId — neither DTO below
 * carries a client-suppliable userId/createdByUserId/source field.
 * ============================================================================
 */

export interface AssignCityManagerTaskResultDTO {
  taskId: string;
  assignedToUserId: string;
  assignedToName: string;
  clubName: string | null;
  date: string;
}

/** Section 11 — the compact "Задачи" status for one club's active manager.
 * `today` counts ONLY DailyTask rows for the app-timezone current date —
 * never a materializing read (no Academy/sales side effect), just a plain
 * count. */
export interface ClubManagerTaskStatusDTO {
  manager: { userId: string; displayName: string };
  today: { total: number; completed: number };
}

/**
 * Management Round E2.1 — the gap E2's compact summary left: a CITY_MANAGER
 * could see a manager's TOTAL today count, but never the actual tasks
 * THEY assigned (text/date/completion), and never a future-dated one
 * before its own day arrives. One row per DailyTask this CITY_MANAGER
 * personally created for this manager — `date` is YYYY-MM-DD (the same
 * app-timezone-day string convention DailyPlanDTO already uses), `status`
 * is the real DailyTaskStatusDTO, never recomputed/renamed.
 */
export interface ManagerDelegatedTaskDTO {
  id: string;
  title: string;
  date: string;
  status: DailyTaskStatusDTO;
}
