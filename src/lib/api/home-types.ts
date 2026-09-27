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
 * Sprint: mini-app-context-switcher — SEPARATE role cabinets, not one mixed
 * Home. A real user may hold several grants at once (PERSONAL/MANAGER +
 * CLUB_MANAGER for one or more clubs + CITY_MANAGER); each is its own full
 * Home EXPERIENCE (`HomeResponseDTO`'s `kind`), never appended to another.
 * `HomeContextDTO` is the lightweight, always-computed descriptor list the
 * context switcher renders from; picking one drives which `kind` `/api/home`
 * returns next. Deliberately NOT an import of cabinet-types.ts's richer
 * DTOs — same anti-circular-import reasoning throughout this file
 * (cabinet-types.ts already imports DailyPlanDTO from here) and because Home
 * never needs the full roster, only enough to summarize + tap through to
 * /team, /city, /city/club, /city/managers.
 */
export type HomeContextType = "PERSONAL" | "CLUB_MANAGER" | "CITY_MANAGER";

export interface HomeContextDTO {
  type: HomeContextType;
  /** Set only for CLUB_MANAGER — disambiguates when a real actor manages
   * several clubs (section 7: each managed club is its OWN selectable
   * context, never an arbitrarily picked "first" one). */
  clubId?: string;
  clubName?: string | null;
  /** Human-facing, never a raw enum — "Личный кабинет", "Управляющий ·
   * Полтавская", "Ст. города · Нижний Новгород". */
  label: string;
}

export interface HomeAttentionItemDTO {
  category: "CLUB_WITHOUT_CLUB_MANAGER" | "PENDING_EMPLOYEE_APPROVAL";
  entityId: string;
  entityName: string;
  clubId: string | null;
}

/** Section 12/15 — the compact per-club row the CITY_MANAGER context's "Мои
 * клубы" AND "Управляющие" sections both render from (a club without a
 * manager shows managerName: null → "Не назначен" + CTA, per section 15). */
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

/** The CITY_MANAGER context's own working-cabinet content — nothing personal
 * mixed in (Sprint: mini-app-context-switcher, section 5). */
export interface CityManagerHomeBlockDTO {
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

/** The CLUB_MANAGER context's own working-cabinet content for ONE specific
 * club — the context switcher (not this block) is what disambiguates a
 * multi-club manager, so clubId here is always a real, single club (Sprint:
 * mini-app-context-switcher, section 6). */
export interface ClubManagerHomeBlockDTO {
  clubId: string;
  clubLabel: string;
  employeeCount: number;
  pendingApprovalCount: number;
  attention: HomeAttentionItemDTO[];
  /** "Обучение команды" section — same honest completed/published-lessons
   * semantics as the desktop cabinet's ClubTrainingSummaryDTO (never
   * "mandatory"/"overdue"). */
  training: { totalPublishedLessons: number; employeesInTraining: number; employeesCompleted: number } | null;
  /** True only when this block reflects an active View-As-CLUB_MANAGER
   * preview (a CITY_MANAGER previewing) — the client hides mutation entry
   * points (approve, assignment) when true. The real server-side boundary is
   * independent of this flag (requireFullAccess/requireClubManagerAccess
   * evaluate the REAL actor; the global View-As middleware blocks writes
   * regardless) — this only controls what's shown. */
  isPreviewing: boolean;
}

/**
 * PERSONAL context — Sprint: mini-app-context-switcher, section 4: "as close
 * as possible to the pre-role-refactor MANAGER experience." No management
 * field of any kind lives here anymore; a management context is a
 * completely separate `kind` (see below), never appended to this one.
 */
export interface HomeDashboardDTO {
  kind: "full";
  profile: HomeProfileDTO | null;
  plan: { total: number; completed: number; tasks: DailyTaskDTO[] };
  xp: { total: number; today: number };
  rating: RatingSummaryDTO;
  mystery: MysterySummaryDTO;
  achievementsCount: number;
  lastAchievement: { title: string; awardedAt: string } | null;
  /** Every context this real actor may switch into right now (always
   * includes this PERSONAL entry when non-empty; a plain MANAGER with no
   * other grants gets exactly one entry — section 7). Empty during an active
   * View-As-MANAGER preview (section 13 — switching doesn't apply then). */
  availableContexts: HomeContextDTO[];
  /** Echoes which entry of availableContexts this response represents
   * (always the PERSONAL one here) — lets the client persist exactly what
   * the server actually resolved, including a silent fallback. */
  activeContext: HomeContextDTO;
}

/** CITY_MANAGER context — Sprint: mini-app-context-switcher, section 5.
 * Management content ONLY; no personal Plan/XP/Rating/Mystery/achievements
 * anywhere on this shape. */
export interface CityManagerHomeContextDTO {
  kind: "city_manager";
  profile: HomeProfileDTO | null;
  block: CityManagerHomeBlockDTO;
  availableContexts: HomeContextDTO[];
  activeContext: HomeContextDTO;
}

/** CLUB_MANAGER context — Sprint: mini-app-context-switcher, section 6.
 * `plan` is the ONE personal-shaped field here — section 6 explicitly places
 * "План на сегодня" as this context's own item 2, reusing the existing Daily
 * Plan primitive (never a new plan system) for the real acting manager. No
 * XP/rating/mystery/achievements/knowledge-base — those are Personal-only. */
export interface ClubManagerHomeContextDTO {
  kind: "club_manager";
  profile: HomeProfileDTO | null;
  plan: { total: number; completed: number; tasks: DailyTaskDTO[] };
  block: ClubManagerHomeBlockDTO;
  availableContexts: HomeContextDTO[];
  activeContext: HomeContextDTO;
}

/**
 * Sprint: mini-app-role-experience, section 2 — served instead of the above
 * while accessStatus=PENDING_APPROVAL. A deliberately different shape (not
 * one of the above with fields nulled out) so the client can never
 * accidentally render a management/plan/rating block for someone who isn't
 * allowed to see one — the `kind` discriminant makes every state impossible
 * to confuse at the type level. No context concept applies to this state.
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

export type HomeResponseDTO = HomeDashboardDTO | CityManagerHomeContextDTO | ClubManagerHomeContextDTO | OnboardingHomeDTO;

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
  /**
   * Sprint: manual-test-round-2, section 5 — server-confirmed (real actor's
   * current RoleAssignment grants, never client-trusted) "is this a real
   * CITY_MANAGER, so the Менеджеры/Клубы toggle should render at all". The
   * "Менеджеры" tab is this SAME board, unchanged (MANAGER's existing
   * employee ranking) — just labeled for contrast once a second tab exists.
   * "Клубы" has no real club-level score anywhere in the data model
   * (audited: MonthlyRating/MonthlySalesInput/MysteryShopperResult are all
   * per-employee, no clubId, no groupBy-by-club anywhere in rating-calc.ts)
   * — that tab is a deliberate, honest "blocked pending business formula"
   * state, never fabricated from an average.
   */
  canViewClubMode?: boolean;
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
