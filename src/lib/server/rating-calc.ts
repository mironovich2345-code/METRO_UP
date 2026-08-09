import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { compareRankRows, computeFinalScore } from "./rating-formula";
import { rankingEmployeeWhere } from "./employees";
import { getEligibilityMap, isEligible } from "./eligibility";
import { getOrCreatePeriod } from "./period";
import { writeRatingAudit } from "./rating-audit";

/**
 * calculateMonthlyRating — SPM-only. Builds the ranking from real data:
 *  eligible employees → sales inputs → latest PUBLISHED mystery → readiness →
 *  finalScore (70/30) → sort → rank → previousRank → upsert DRAFT MonthlyRating
 *  → period READY → audit. Idempotent (transaction; recompute replaces DRAFT
 *  rows). Never publishes automatically.
 *
 * Tie-breaker (deterministic): finalScore desc → mysteryScore desc → salesScore
 * desc → User.createdAt asc → id asc.
 */
export async function calculateMonthlyRating(month: number, year: number, actorUserId: string) {
  const period = await getOrCreatePeriod(month, year);
  if (period.status === "PUBLISHED")
    throw new AuthError(409, "period_published", "Верните период в работу перед пересчётом");

  const users = await prisma.user.findMany({
    where: rankingEmployeeWhere(),
    select: { id: true, createdAt: true },
  });
  const eligibilityMap = await getEligibilityMap(month, year);
  const eligible = users.filter((u) => isEligible(eligibilityMap, u.id));
  const ids = eligible.map((u) => u.id);

  const [sales, mysteries, prevPeriod] = await Promise.all([
    prisma.monthlySalesInput.findMany({ where: { month, year, employeeUserId: { in: ids } } }),
    prisma.mysteryShopperResult.findMany({
      where: { periodMonth: month, periodYear: year, status: "PUBLISHED", employeeUserId: { in: ids } },
    }),
    prisma.ratingPeriod.findFirst({
      where: { status: "PUBLISHED", OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);
  const salesByUser = new Map(sales.map((s) => [s.employeeUserId, s]));
  const mysteryByUser = new Map(mysteries.map((m) => [m.employeeUserId, m]));
  const createdAtByUser = new Map(eligible.map((u) => [u.id, u.createdAt.getTime()]));

  let prevRankByUser = new Map<string, number>();
  if (prevPeriod) {
    const prev = await prisma.monthlyRating.findMany({
      where: { month: prevPeriod.month, year: prevPeriod.year, status: "PUBLISHED" },
      select: { employeeUserId: true, rank: true },
    });
    prevRankByUser = new Map(prev.map((r) => [r.employeeUserId, r.rank]));
  }

  // Readiness: sales (plan>0, salesScore!=null) AND a PUBLISHED mystery.
  const ready = eligible
    .map((u) => {
      const s = salesByUser.get(u.id);
      const m = mysteryByUser.get(u.id);
      if (!s || s.personalPlan <= 0 || s.salesScore == null || !m) return null;
      return {
        userId: u.id,
        salesScore: s.salesScore,
        mysteryScore: m.score,
        finalScore: computeFinalScore(s.salesScore, m.score),
        createdAt: createdAtByUser.get(u.id) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  ready.sort(compareRankRows);

  const updated = await prisma.$transaction(async (tx) => {
    // Replace transient DRAFT rows (never touches PUBLISHED history).
    await tx.monthlyRating.deleteMany({ where: { month, year, status: "DRAFT" } });
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      await tx.monthlyRating.create({
        data: {
          employeeUserId: r.userId, month, year,
          salesScore: r.salesScore, mysteryShopperScore: r.mysteryScore, finalScore: r.finalScore,
          rank: i + 1, previousRank: prevRankByUser.get(r.userId) ?? null, status: "DRAFT",
        },
      });
    }
    const p = await tx.ratingPeriod.update({
      where: { id: period.id },
      data: { status: "READY", calculatedAt: new Date() },
    });
    await writeRatingAudit(tx, {
      actorUserId, action: "RATING_CALCULATE", entityType: "RatingPeriod", entityId: p.id,
      month, year, after: { eligible: eligible.length, ranked: ready.length },
    });
    return p;
  });

  return { period: updated, ranked: ready.length, eligible: eligible.length };
}
