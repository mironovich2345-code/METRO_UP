import "server-only";
import { prisma } from "./db";
import { awardAchievement } from "./achievements";

/**
 * Rating / mystery / sales achievement triggers. All awards are idempotent
 * (unique(userId, achievementId)). Sales + rating achievements are evaluated at
 * rating PUBLISH time (final data); mystery at mystery PUBLISH time.
 */

function monthMinus(month: number, year: number, k: number): { month: number; year: number } {
  let m = month - k;
  let y = year;
  while (m <= 0) { m += 12; y -= 1; }
  return { month: m, year: y };
}

/** Best PUBLISHED mystery score → MYSTERY_90/95/100. */
export async function evaluateMysteryAchievements(userId: string): Promise<void> {
  const results = await prisma.mysteryShopperResult.findMany({
    where: { employeeUserId: userId, status: "PUBLISHED" },
    select: { score: true },
  });
  if (!results.length) return;
  const best = Math.max(...results.map((r) => r.score));
  if (best >= 90) await awardAchievement(userId, "MYSTERY_90", "MYSTERY");
  if (best >= 95) await awardAchievement(userId, "MYSTERY_95", "MYSTERY");
  if (best >= 100) await awardAchievement(userId, "MYSTERY_100", "MYSTERY");
}

/** Sales plan achievements for a completed period → PLAN_100/110 + PLAN_STREAK_3. */
async function evaluateSalesAchievements(userId: string, month: number, year: number): Promise<void> {
  const input = await prisma.monthlySalesInput.findUnique({
    where: { employeeUserId_month_year: { employeeUserId: userId, month, year } },
    select: { salesScore: true },
  });
  if (!input || input.salesScore == null) return;
  if (input.salesScore >= 100) await awardAchievement(userId, "PLAN_100", "SALES", `${year}-${month}`);
  if (input.salesScore >= 110) await awardAchievement(userId, "PLAN_110", "SALES", `${year}-${month}`);

  // 3 consecutive months with salesScore >= 100.
  const months = [0, 1, 2].map((k) => monthMinus(month, year, k));
  const rows = await prisma.monthlySalesInput.findMany({
    where: { employeeUserId: userId, OR: months.map((m) => ({ month: m.month, year: m.year })) },
    select: { month: true, year: true, salesScore: true },
  });
  const ok = months.every((m) =>
    rows.some((r) => r.month === m.month && r.year === m.year && (r.salesScore ?? 0) >= 100),
  );
  if (ok) await awardAchievement(userId, "PLAN_STREAK_3", "SALES", `${year}-${month}`);
}

/** After a period is PUBLISHED: rating + sales achievements for each ranked user. */
export async function evaluateRatingAchievements(month: number, year: number): Promise<void> {
  const ratings = await prisma.monthlyRating.findMany({
    where: { month, year, status: "PUBLISHED" },
    select: { employeeUserId: true, rank: true, previousRank: true },
  });

  for (const r of ratings) {
    await awardAchievement(r.employeeUserId, "FIRST_RATING", "RATING", `${year}-${month}`);
    if (r.rank <= 10) await awardAchievement(r.employeeUserId, "TOP_10", "RATING");
    if (r.rank <= 3) await awardAchievement(r.employeeUserId, "TOP_3", "RATING");
    if (r.rank === 1) await awardAchievement(r.employeeUserId, "BEST_MANAGER", "RATING");
    await evaluateSalesAchievements(r.employeeUserId, month, year);
  }

  // BIGGEST_GROWTH — largest positive rank improvement vs previous period.
  const withDelta = ratings
    .filter((r) => r.previousRank != null)
    .map((r) => ({ userId: r.employeeUserId, delta: (r.previousRank as number) - r.rank }));
  if (withDelta.length) {
    const maxDelta = Math.max(...withDelta.map((r) => r.delta));
    if (maxDelta > 0) {
      for (const r of withDelta.filter((r) => r.delta === maxDelta)) {
        await awardAchievement(r.userId, "BIGGEST_GROWTH", "RATING", `${year}-${month}`);
      }
    }
  }
}
