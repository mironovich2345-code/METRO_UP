/** Client-safe DTOs for the SPM control panel. Never exposes telegramId/username
 * or raw DB ids beyond the employee user id needed to address rows. */

export type RatingStatusDTO = "DRAFT" | "READY" | "PUBLISHED";
export type MysteryStatusDTO = "DRAFT" | "PUBLISHED";

export interface SpmPeriodDTO {
  month: number;
  year: number;
  label: string;
  status: RatingStatusDTO;
  calculatedAt: string | null;
  publishedAt: string | null;
}

export interface SpmEmployeeDTO {
  employeeUserId: string;
  displayName: string;
  positionTitle: string | null;
  cityId: string | null;
  cityName: string | null;
  clubId: string | null;
  clubName: string | null;
}

export interface SpmSalesRowDTO extends SpmEmployeeDTO {
  personalPlan: number | null;
  personalFact: number | null;
  salesScore: number | null;
}

export interface SpmMysteryRowDTO extends SpmEmployeeDTO {
  resultId: string | null;
  score: number | null;
  checkedAt: string | null;
  comment: string | null;
  status: MysteryStatusDTO | null;
}

export interface SpmReadinessDTO {
  eligibleCount: number;
  readyCount: number;
  missingSales: number;
  missingMystery: number;
  excludedCount: number;
}

export interface SpmRatingRowDTO {
  rank: number;
  employeeUserId: string;
  displayName: string;
  clubName: string | null;
  salesScore: number;
  mysteryScore: number;
  finalScore: number;
  previousRank: number | null;
  delta: number | null;
}

export interface SpmRatingViewDTO {
  period: SpmPeriodDTO;
  readiness: SpmReadinessDTO;
  rows: SpmRatingRowDTO[]; // calculated rows (may be empty before calculation)
  canCalculate: boolean;
  canPublish: boolean;
}

export interface SpmOverviewDTO {
  workingPeriod: SpmPeriodDTO; // the period being rated (previous calendar month)
  currentLabel: string; // current calendar month label (for context)
  eligibleCount: number;
  salesFilled: number;
  mysteryFilled: number;
  readyCount: number;
  published: boolean;
}
