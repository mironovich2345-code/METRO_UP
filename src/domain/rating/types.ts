/**
 * Monthly Rating domain — network-wide standing for a PAST calendar month.
 *
 * Fully independent from XP and Career. Built from two API-ready sources:
 * manager-entered sales (% of personal plan) and SPM-entered mystery-shopper
 * scores. Only a PUBLISHED period is ever shown to employees.
 */

export type RatingStatus = "DRAFT" | "READY" | "PUBLISHED";

export type MonthlyAwardType =
  | "BEST_MANAGER"
  | "BEST_MYSTERY_SHOPPER"
  | "BIGGEST_GROWTH"
  | "ROOKIE_OF_MONTH";

export interface RatingEmployee {
  id: string;
  name: string;
  clubId: string;
}

/** Sales input — entered by the club manager (управляющий). */
export interface ManagerMonthlySales {
  employeeId: string;
  month: number;
  year: number;
  plan: number;
  fact: number;
  /** Percent of personal plan (the salesScore). */
  percent: number;
}

/** Mystery-shopper input — entered by the SPM (СПМ). */
export interface MysteryShopperResult {
  employeeId: string;
  month: number;
  year: number;
  /** 0–100. */
  score: number;
  comment: string;
}

export interface MonthlyRating {
  month: number;
  year: number;
  employeeId: string;
  salesScore: number;
  mysteryShopperScore: number;
  finalScore: number;
  rank: number;
}

export interface MonthlyAward {
  type: MonthlyAwardType;
  month: number;
  year: number;
  employeeId: string;
}

export interface RatingPeriod {
  month: number;
  year: number;
  status: RatingStatus;
}

/* ---- Resolved, UI-ready shapes ---- */

export interface RatingRow {
  rank: number;
  employee: RatingEmployee;
  finalScore: number;
  salesScore: number;
  mysteryShopperScore: number;
  isCurrentUser: boolean;
  /** Rank change vs the previous month (+ up / − down), or null. */
  delta: number | null;
}

export interface PublishedBoard {
  month: number;
  year: number;
  /** e.g. "Июль 2026". */
  label: string;
  status: "PUBLISHED";
  top: RatingRow[];
  currentUser: RatingRow | null;
  currentUserInTop: boolean;
  total: number;
}
