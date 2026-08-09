import "server-only";
import { prisma } from "./db";
import { round1 } from "./rating-formula";
import { rankingEmployeeWhere } from "./employees";
import { getEligibilityMap, isEligible } from "./eligibility";
import { getPeriod, isPublishablePeriod, periodLabel } from "./period";
import type {
  SpmPeriodDTO,
  SpmRatingRowDTO,
  SpmRatingViewDTO,
  SpmReadinessDTO,
} from "@/lib/api/spm-types";
import type { RatingStatus } from "@prisma/client";

export function toPeriodDTO(
  month: number,
  year: number,
  status: RatingStatus,
  calculatedAt: Date | null,
  publishedAt: Date | null,
): SpmPeriodDTO {
  return {
    month, year, label: periodLabel(month, year), status,
    calculatedAt: calculatedAt?.toISOString() ?? null,
    publishedAt: publishedAt?.toISOString() ?? null,
  };
}

/** Readiness counts for a period (eligible / ready / missing sales / mystery / excluded). */
export async function getReadiness(month: number, year: number): Promise<SpmReadinessDTO> {
  const users = await prisma.user.findMany({ where: rankingEmployeeWhere(), select: { id: true } });
  const eligibilityMap = await getEligibilityMap(month, year);
  const eligible = users.filter((u) => isEligible(eligibilityMap, u.id));
  const excludedCount = users.length - eligible.length;
  const ids = eligible.map((u) => u.id);

  const [sales, mysteries] = await Promise.all([
    prisma.monthlySalesInput.findMany({ where: { month, year, employeeUserId: { in: ids } } }),
    prisma.mysteryShopperResult.findMany({
      where: { periodMonth: month, periodYear: year, status: "PUBLISHED", employeeUserId: { in: ids } },
      select: { employeeUserId: true },
    }),
  ]);
  const hasSales = new Set(sales.filter((s) => s.personalPlan > 0 && s.salesScore != null).map((s) => s.employeeUserId));
  const hasMystery = new Set(mysteries.map((m) => m.employeeUserId));

  let readyCount = 0;
  for (const id of ids) if (hasSales.has(id) && hasMystery.has(id)) readyCount++;

  return {
    eligibleCount: eligible.length,
    readyCount,
    missingSales: ids.filter((id) => !hasSales.has(id)).length,
    missingMystery: ids.filter((id) => !hasMystery.has(id)).length,
    excludedCount,
  };
}

/** Full SPM rating view for a period (period + readiness + calculated rows). */
export async function getSpmRatingView(month: number, year: number): Promise<SpmRatingViewDTO> {
  const [periodRow, readiness, ratings] = await Promise.all([
    getPeriod(month, year),
    getReadiness(month, year),
    prisma.monthlyRating.findMany({
      where: { month, year },
      orderBy: { rank: "asc" },
      include: {
        employee: { select: { displayName: true, employeeProfile: { select: { club: { select: { name: true } } } } } },
      },
    }),
  ]);

  const status: RatingStatus = periodRow?.status ?? "DRAFT";
  const rows: SpmRatingRowDTO[] = ratings.map((r) => ({
    rank: r.rank,
    employeeUserId: r.employeeUserId,
    displayName: r.employee.displayName,
    clubName: r.employee.employeeProfile?.club?.name ?? null,
    salesScore: round1(r.salesScore),
    mysteryScore: round1(r.mysteryShopperScore),
    finalScore: round1(r.finalScore),
    previousRank: r.previousRank,
    delta: r.previousRank != null ? r.previousRank - r.rank : null,
  }));

  return {
    period: toPeriodDTO(month, year, status, periodRow?.calculatedAt ?? null, periodRow?.publishedAt ?? null),
    readiness,
    rows,
    canCalculate: status !== "PUBLISHED" && readiness.readyCount > 0,
    canPublish: status === "READY" && isPublishablePeriod(month, year) && rows.length > 0,
  };
}
