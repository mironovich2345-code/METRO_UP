import "server-only";
import { prisma } from "./db";
import { ruMonthYear } from "@/lib/labels";
import { isRankingPosition, round1 } from "./rating-formula";
import type {
  RatingBoardDTO,
  RatingBoardRowDTO,
  RatingSummaryDTO,
} from "@/lib/api/home-types";

/**
 * Monthly rating read model. Only real Users + EmployeeProfiles + PUBLISHED
 * MonthlyRating rows are used — never mock. If nothing is published, an honest
 * empty state is returned (no invented ranks/scores).
 */

async function latestPublishedPeriod(): Promise<{ month: number; year: number } | null> {
  const row = await prisma.monthlyRating.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { month: true, year: true },
  });
  return row ? { month: row.month, year: row.year } : null;
}

/** Full leaderboard for the latest published period (Top-10 + current user). */
export async function getRatingBoard(userId: string): Promise<RatingBoardDTO> {
  const period = await latestPublishedPeriod();
  if (!period) {
    return { hasData: false, top: [], currentUser: null, currentUserInTop: false };
  }

  const ratings = await prisma.monthlyRating.findMany({
    where: { status: "PUBLISHED", month: period.month, year: period.year },
    orderBy: { rank: "asc" },
    include: {
      employee: {
        select: {
          id: true,
          displayName: true,
          role: true,
          employeeProfile: { select: { positionId: true, club: { select: { name: true } } } },
        },
      },
    },
  });

  // Only real EMPLOYEE users with a valid profile in a ranking position.
  const eligible = ratings.filter(
    (r) =>
      r.employee.role === "EMPLOYEE" &&
      r.employee.employeeProfile &&
      isRankingPosition(r.employee.employeeProfile.positionId),
  );

  const toRow = (r: (typeof eligible)[number]): RatingBoardRowDTO => ({
    rank: r.rank,
    displayName: r.employee.displayName,
    clubName: r.employee.employeeProfile?.club?.name ?? null,
    finalScore: round1(r.finalScore),
    delta: r.previousRank != null ? r.previousRank - r.rank : null,
    isCurrentUser: r.employee.id === userId,
  });

  const top = eligible.slice(0, 10).map(toRow);
  const currentUserInTop = top.some((r) => r.isCurrentUser);
  const currentUserRating = eligible.find((r) => r.employee.id === userId);
  const currentUser =
    currentUserRating && !currentUserInTop ? toRow(currentUserRating) : null;

  return {
    hasData: true,
    periodLabel: ruMonthYear(period.month, period.year),
    top,
    currentUser,
    currentUserInTop,
  };
}

/** Compact summary for the Home rating card. */
export async function getRatingSummary(userId: string): Promise<RatingSummaryDTO> {
  const board = await getRatingBoard(userId);
  if (!board.hasData) return { hasData: false };
  const me = board.top.find((r) => r.isCurrentUser) ?? board.currentUser;
  if (!me) {
    // Published period exists but the user isn't ranked in it.
    return { hasData: true, periodLabel: board.periodLabel };
  }
  return {
    hasData: true,
    periodLabel: board.periodLabel,
    rank: me.rank,
    finalScore: me.finalScore,
    delta: me.delta,
  };
}
