import type { EmployeePosition } from "@prisma/client";

/**
 * Approved rating formula (pure, unit-testable — no DB, no server-only).
 *   salesScore = personalFact / personalPlan * 100, capped at 120.
 *   finalScore = salesScore * 0.70 + mysteryShopperScore * 0.30
 * Rounding happens only at the UI (1 decimal).
 */
export const SALES_CAP = 120;

/** null when the plan is non-positive (rating cannot be computed). */
export function computeSalesScore(personalPlan: number, personalFact: number): number | null {
  if (personalPlan <= 0) return null;
  return Math.min((personalFact / personalPlan) * 100, SALES_CAP);
}

export function computeFinalScore(salesScore: number, mysteryShopperScore: number): number {
  return salesScore * 0.7 + mysteryShopperScore * 0.3;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Positions included in the sales ranking for v1: CLIENT_MANAGER and
 * NIGHT_MANAGER. ADMINISTRATOR is excluded — administrators are not a sales role,
 * so including them in a sales-weighted ranking is not product-defined yet.
 */
export const RANKING_POSITIONS: EmployeePosition[] = ["CLIENT_MANAGER", "NIGHT_MANAGER"];

export function isRankingPosition(p: EmployeePosition | null | undefined): boolean {
  return p != null && RANKING_POSITIONS.includes(p);
}
