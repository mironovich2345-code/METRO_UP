import {
  CURRENT_EMPLOYEE_ID,
  EMPLOYEES,
  MANAGER_SALES,
  MYSTERY_RESULTS,
  PREVIOUS_RANKS,
  RATING_PERIOD,
} from "./data";
import type {
  MonthlyRating,
  PublishedBoard,
  RatingEmployee,
  RatingRow,
} from "./types";

export * from "./types";
export {
  CURRENT_EMPLOYEE_ID,
  EMPLOYEES,
  MANAGER_SALES,
  MYSTERY_RESULTS,
  MONTHLY_AWARDS,
  RATING_PERIOD,
} from "./data";

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** finalScore = salesScore × 0.7 + mysteryShopperScore × 0.3 (% of plan, not sum). */
export function computeFinalScore(
  salesScore: number,
  mysteryShopperScore: number,
): number {
  return round1(salesScore * 0.7 + mysteryShopperScore * 0.3);
}

export function periodLabel(month: number, year: number): string {
  return `${MONTH_NAMES_RU[month - 1] ?? ""} ${year}`.trim();
}

/** Join the two data sources into ranked MonthlyRating rows. */
export function buildMonthlyRatings(): MonthlyRating[] {
  const salesBy = new Map(MANAGER_SALES.map((s) => [s.employeeId, s]));
  const mysteryBy = new Map(MYSTERY_RESULTS.map((m) => [m.employeeId, m]));

  const rows: MonthlyRating[] = EMPLOYEES.map((e) => {
    const salesScore = salesBy.get(e.id)?.percent ?? 0;
    const mysteryShopperScore = mysteryBy.get(e.id)?.score ?? 0;
    return {
      month: RATING_PERIOD.month,
      year: RATING_PERIOD.year,
      employeeId: e.id,
      salesScore,
      mysteryShopperScore,
      finalScore: computeFinalScore(salesScore, mysteryShopperScore),
      rank: 0,
    };
  });

  rows.sort(
    (a, b) => b.finalScore - a.finalScore || b.salesScore - a.salesScore,
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

function toRow(
  rating: MonthlyRating,
  employee: RatingEmployee,
  currentId: string,
): RatingRow {
  const prev = PREVIOUS_RANKS[rating.employeeId];
  return {
    rank: rating.rank,
    employee,
    finalScore: rating.finalScore,
    salesScore: rating.salesScore,
    mysteryShopperScore: rating.mysteryShopperScore,
    isCurrentUser: rating.employeeId === currentId,
    delta: typeof prev === "number" ? prev - rating.rank : null,
  };
}

/**
 * The published board for employees: top-10 plus the current user's own row.
 * Returns null while the period is not PUBLISHED (nothing to show yet).
 */
export function getPublishedBoard(
  currentId: string = CURRENT_EMPLOYEE_ID,
): PublishedBoard | null {
  if (RATING_PERIOD.status !== "PUBLISHED") return null;

  const ratings = buildMonthlyRatings();
  const empById = new Map(EMPLOYEES.map((e) => [e.id, e]));
  const rows = ratings
    .map((r) => {
      const emp = empById.get(r.employeeId);
      return emp ? toRow(r, emp, currentId) : null;
    })
    .filter((r): r is RatingRow => r !== null);

  const top = rows.slice(0, 10);
  const currentUser = rows.find((r) => r.isCurrentUser) ?? null;

  return {
    month: RATING_PERIOD.month,
    year: RATING_PERIOD.year,
    label: periodLabel(RATING_PERIOD.month, RATING_PERIOD.year),
    status: "PUBLISHED",
    top,
    currentUser,
    currentUserInTop: Boolean(currentUser && currentUser.rank <= 10),
    total: rows.length,
  };
}
