/** Client-safe DTOs for the production Home dashboard, daily plan, rating,
 * mystery shopper and achievements. All values come from PostgreSQL — no mock. */

export type DailyTaskCategoryDTO = "LEARNING" | "SALES" | "CLIENTS" | "SERVICE" | "SHIFT";
export type DailyTaskStatusDTO = "TODO" | "COMPLETED" | "SKIPPED";
/** auto = server-completed only; manual = user can complete/skip; blocked = pending external data. */
export type DailyTaskMode = "auto" | "manual" | "blocked";

export interface DailyTaskDTO {
  id: string;
  title: string;
  description: string | null;
  category: DailyTaskCategoryDTO;
  status: DailyTaskStatusDTO;
  mode: DailyTaskMode;
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

export interface HomeDashboardDTO {
  profile: HomeProfileDTO | null;
  plan: { total: number; completed: number; tasks: DailyTaskDTO[] };
  xp: { total: number; today: number };
  rating: RatingSummaryDTO;
  mystery: MysterySummaryDTO;
  achievementsCount: number;
  lastAchievement: { title: string; awardedAt: string } | null;
}

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
