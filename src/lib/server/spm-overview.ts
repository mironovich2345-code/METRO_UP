import "server-only";
import { prisma } from "./db";
import { appMonthYear } from "./time";
import { getPeriod, periodLabel, previousCalendarMonth } from "./period";
import { getReadiness, toPeriodDTO } from "./rating-view";
import { rankingEmployeeWhere } from "./employees";
import { getEligibilityMap, isEligible } from "./eligibility";
import type { SpmOverviewDTO } from "@/lib/api/spm-types";

/** SPM overview for a working period (defaults to the previous calendar month). */
export async function getSpmOverview(month: number, year: number): Promise<SpmOverviewDTO> {
  const [periodRow, readiness, users, eligibilityMap] = await Promise.all([
    getPeriod(month, year),
    getReadiness(month, year),
    prisma.user.findMany({ where: rankingEmployeeWhere(), select: { id: true } }),
    getEligibilityMap(month, year),
  ]);
  const eligibleIds = users.filter((u) => isEligible(eligibilityMap, u.id)).map((u) => u.id);

  const [salesFilled, mysteryFilled] = await Promise.all([
    prisma.monthlySalesInput.count({
      where: { month, year, employeeUserId: { in: eligibleIds }, personalPlan: { gt: 0 } },
    }),
    prisma.mysteryShopperResult.count({
      where: { periodMonth: month, periodYear: year, status: "PUBLISHED", employeeUserId: { in: eligibleIds } },
    }),
  ]);

  const cur = appMonthYear();
  return {
    workingPeriod: toPeriodDTO(
      month, year, periodRow?.status ?? "DRAFT",
      periodRow?.calculatedAt ?? null, periodRow?.publishedAt ?? null,
    ),
    currentLabel: periodLabel(cur.month, cur.year),
    eligibleCount: readiness.eligibleCount,
    salesFilled,
    mysteryFilled,
    readyCount: readiness.readyCount,
    published: (periodRow?.status ?? "DRAFT") === "PUBLISHED",
  };
}

/** Default working period = previous calendar month. */
export function defaultWorkingPeriod(): { month: number; year: number } {
  return previousCalendarMonth();
}
