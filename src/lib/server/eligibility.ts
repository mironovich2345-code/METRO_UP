import "server-only";
import { prisma } from "./db";
import { writeRatingAudit } from "./rating-audit";

/**
 * Per-employee rating eligibility for a period. Default is eligible (a profile
 * that existed in the period). SPM can explicitly exclude an employee (e.g. a
 * newcomer who didn't work a full month) without blocking the whole period.
 */
export async function getEligibilityMap(month: number, year: number): Promise<Map<string, boolean>> {
  const rows = await prisma.ratingEligibility.findMany({ where: { month, year } });
  return new Map(rows.map((r) => [r.employeeUserId, r.isEligible]));
}

export function isEligible(map: Map<string, boolean>, employeeUserId: string): boolean {
  return map.get(employeeUserId) ?? true; // default eligible
}

export async function setEligibility(
  actorUserId: string,
  input: { employeeUserId: string; month: number; year: number; isEligible: boolean; reason?: string | null },
) {
  const row = await prisma.ratingEligibility.upsert({
    where: { employeeUserId_month_year: { employeeUserId: input.employeeUserId, month: input.month, year: input.year } },
    update: { isEligible: input.isEligible, reason: input.reason ?? null, updatedByUserId: actorUserId },
    create: {
      employeeUserId: input.employeeUserId, month: input.month, year: input.year,
      isEligible: input.isEligible, reason: input.reason ?? null, updatedByUserId: actorUserId,
    },
  });
  await writeRatingAudit(prisma, {
    actorUserId, action: "ELIGIBILITY_CHANGE", entityType: "RatingEligibility", entityId: row.id,
    month: input.month, year: input.year, after: { isEligible: row.isEligible },
  });
  return row;
}
