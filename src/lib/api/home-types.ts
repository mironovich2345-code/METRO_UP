/** Client-safe DTOs for the production Home dashboard, daily plan, rating,
 * mystery shopper and achievements. All values come from PostgreSQL — no mock. */

export type DailyTaskCategoryDTO = "LEARNING" | "SALES" | "CLIENTS" | "SERVICE" | "SHIFT" | "MANAGER";
export type DailyTaskStatusDTO = "TODO" | "COMPLETED" | "SKIPPED";
/** auto = server-completed only; manual = user can complete/skip; blocked = pending external data. */
export type DailyTaskMode = "auto" | "manual" | "blocked";

export type DailyTaskPriorityDTO = "NORMAL" | "HIGH";

export interface ChecklistItemDTO {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
  order: number;
}

export interface DailyTaskDTO {
  id: string;
  title: string;
  description: string | null;
  category: DailyTaskCategoryDTO;
  status: DailyTaskStatusDTO;
  mode: DailyTaskMode;
  required: boolean;
  priority: DailyTaskPriorityDTO;
  timeHint: string | null;
  checklist: ChecklistItemDTO[];
  order: number;
  /** For LEARNING tasks — the lesson slug to open (null when nothing pending). */
  actionSlug: string | null;
}

export interface DailyPlanDTO {
  date: string;
  total: number;
  completed: number;
  tasks: DailyTaskDTO[];
}

export interface RatingSummaryDTO {
  hasData: boolean;
  periodLabel?: string;
  rank?: number;
  finalScore?: number;
  delta?: number | null;
}

export interface MysterySummaryDTO {
  hasData: boolean;
  periodLabel?: string;
  score?: number;
  comment?: string | null;
}

export interface HomeProfileDTO {
  displayName: string;
  positionTitle: string | null;
  clubName: string | null;
  cityName: string | null;
}

/**
 * Sprint: mini-app-role-experience — the Mini App's own, deliberately LEAN
 * management summary for Home (section 5-16). Full drill-down (roster,
 * assignment, revoke) lives on dedicated screens (/team, /city, /city/club)
 * that call the existing cabinet APIs (cabinet-client.ts/cabinet-types.ts)
 * directly — this shape is intentionally NOT those DTOs re-exported, to
 * avoid a circular import (cabinet-types.ts already imports DailyPlanDTO
 * from this file) and because Home never needs the full club list/roster,
 * only enough to summarize + tap through.
 */
export interface HomeAttentionItemDTO {
  category: "CLUB_WITHOUT_CLUB_MANAGER" | "PENDING_EMPLOYEE_APPROVAL";
  entityId: string;
  entityName: string;
  clubId: string | null;
}

/** Section 12/15 — the compact per-club row Home's "Мои клубы" AND
 * "Управляющие" sections both render from (a club without a manager shows
 * managerName: null → "Не назначен" + CTA, per section 15). Deliberately NOT
 * an import of cabinet-types.ts's richer CityManagerClubSummaryDTO — same
 * anti-circular-import reasoning as the rest of this block (see the header
 * comment above) — but structurally sourced from the exact same dashboard
 * row server-side, so the numbers always agree with the desktop cabinet's. */
export interface CityManagerHomeClubDTO {
  clubId: string;
  clubName: string;
  employeeCount: number;
  managerName: string | null;
  attentionCount: number;
  /** null when there is no published content yet or no employees to average
   * over — never a fabricated 0/100. */
  trainingCompletionPercent: number | null;
}

export interface CityManagerHomeBlockDTO {
  role: "CITY_MANAGER";
  /** "Нижний Новгород" (one city), "Города: А, Б" (several), or a club-only
   * scope label — never assumes exactly one city. */
  scopeLabel: string;
  clubCount: number;
  employeeCount: number;
  clubManagerCount: number;
  pendingApprovalCount: number;
  attention: HomeAttentionItemDTO[];
  clubs: CityManagerHomeClubDTO[];
  /** Aggregate "Обучение по клубам" numbers — same honest semantics as the
   * desktop cabinet (see cabinet-dashboards.ts's header comment): never
   * "compliance", just (completed)/(published lessons) today. Null when
   * there's no one in scope yet. */
  training: { totalPublishedLessons: number; averageProgressPercent: number | null; employeesCompletedAll: number } | null;
}

export interface ClubManagerHomeBlockDTO {
  role: "CLUB_MANAGER";
  /** null when the real actor manages MORE THAN ONE club — Home shows a
   * neutral "you manage N clubs" summary instead of guessing one (section 6);
   * the actual selection happens on /team. Always set during an active
   * View-As-CLUB_MANAGER preview (exactly one club, the previewed one). */
  clubId: string | null;
  clubLabel: string;
  /** Present only when clubId is set (a single resolved club). */
  employeeCount: number | null;
  pendingApprovalCount: number | null;
  attention: HomeAttentionItemDTO[];
  /** "Обучение команды" section — same honest completed/published-lessons
   * semantics as the desktop cabinet's ClubTrainingSummaryDTO (never
   * "mandatory"/"overdue"). Null alongside employeeCount when clubId is null
   * (multi-club, no single club selected yet). */
  training: { totalPublishedLessons: number; employeesInTraining: number; employeesCompleted: number } | null;
  managedClubCount: number;
  /** True only when this block reflects an active View-As-CLUB_MANAGER
   * preview (a CITY_MANAGER previewing) — the client hides mutation entry
   * points (approve, assignment) when true. The real server-side boundary is
   * independent of this flag (requireFullAccess/requireClubManagerAccess
   * evaluate the REAL actor; the global View-As middleware blocks writes
   * regardless) — this only controls what's shown. */
  isPreviewing: boolean;
}

export type ManagementHomeBlockDTO = CityManagerHomeBlockDTO | ClubManagerHomeBlockDTO;

export interface HomeDashboardDTO {
  kind: "full";
  profile: HomeProfileDTO | null;
  plan: { total: number; completed: number; tasks: DailyTaskDTO[] };
  xp: { total: number; today: number };
  rating: RatingSummaryDTO;
  mystery: MysterySummaryDTO;
  achievementsCount: number;
  lastAchievement: { title: string; awardedAt: string } | null;
  /** Human-facing label for the acting management role — "Управляющий ·
   * Коминтерна", "Ст. города · Нижний Новгород" — never a raw enum. Null for
   * a plain MANAGER (or a View-As-MANAGER preview). */
  roleLabel: string | null;
  /** Non-null only for a real CITY_MANAGER/CLUB_MANAGER (precedence:
   * CITY_MANAGER > CLUB_MANAGER), or during an active View-As-CLUB_MANAGER
   * preview. Never present during a View-As-MANAGER preview (section 18 —
   * that shows the normal employee experience). */
  management: ManagementHomeBlockDTO | null;
}

/**
 * Sprint: mini-app-role-experience, section 2 — served instead of
 * HomeDashboardDTO while accessStatus=PENDING_APPROVAL. A deliberately
 * different shape (not HomeDashboardDTO with fields nulled out) so the
 * client can never accidentally render a management/plan/rating block for
 * someone who isn't allowed to see one — the `kind` discriminant makes the
 * two states impossible to confuse at the type level.
 */
export interface OnboardingHomeDTO {
  kind: "onboarding";
  profile: HomeProfileDTO | null;
  /** null only when no PUBLISHED onboarding content exists at all yet
   * (honest empty state, never fabricated). */
  academy: {
    courseTitle: string;
    completed: number;
    total: number;
    /** Sum of the onboarding program's lessons' durationMinutes — 0 when the
     * content genuinely has no estimated time set, never fabricated. */
    totalDurationMinutes: number;
    nextLessonSlug: string | null;
  } | null;
}

export type HomeResponseDTO = HomeDashboardDTO | OnboardingHomeDTO;

export interface RatingBoardRowDTO {
  rank: number;
  displayName: string;
  clubName: string | null;
  finalScore: number;
  delta: number | null;
  isCurrentUser: boolean;
}
export interface RatingBoardDTO {
  hasData: boolean;
  periodLabel?: string;
  top: RatingBoardRowDTO[];
  currentUser: RatingBoardRowDTO | null;
  currentUserInTop: boolean;
}

export interface AchievementDTO {
  code: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  awarded: boolean;
  awardedAt: string | null;
}
