import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { getRankingEmployees, type EmployeeFilter } from "./employees";
import { writeRatingAudit } from "./rating-audit";
import { evaluateMysteryAchievements } from "./rating-achievements";
import type { SpmMysteryRowDTO } from "@/lib/api/spm-types";

/**
 * Mystery shopper inputs for a period. SPM enters score (0–100), checkedAt and
 * an optional comment as DRAFT, then PUBLISHES. Employees only ever see the
 * latest PUBLISHED result. Multiple checks policy (v1): the rating uses the
 * LATEST PUBLISHED result for the period (see rating-calc + docs).
 */
export async function getMysteryRows(
  month: number,
  year: number,
  filter?: EmployeeFilter,
): Promise<SpmMysteryRowDTO[]> {
  const employees = await getRankingEmployees(filter);
  const results = await prisma.mysteryShopperResult.findMany({
    where: { periodMonth: month, periodYear: year, employeeUserId: { in: employees.map((e) => e.employeeUserId) } },
  });
  const byUser = new Map(results.map((r) => [r.employeeUserId, r]));
  return employees.map((e) => {
    const r = byUser.get(e.employeeUserId);
    return {
      ...e,
      resultId: r?.id ?? null,
      score: r?.score ?? null,
      checkedAt: r?.checkedAt?.toISOString() ?? null,
      comment: r?.comment ?? null,
      status: r?.status ?? null,
    };
  });
}

export async function upsertMystery(
  actorUserId: string,
  input: { employeeUserId: string; month: number; year: number; score: number; checkedAt?: string | null; comment?: string | null },
) {
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)
    throw new AuthError(400, "invalid_score", "Оценка должна быть целым числом 0–100");

  const existing = await prisma.mysteryShopperResult.findUnique({
    where: { employeeUserId_periodMonth_periodYear: { employeeUserId: input.employeeUserId, periodMonth: input.month, periodYear: input.year } },
  });
  if (existing?.status === "PUBLISHED")
    throw new AuthError(409, "already_published", "Результат опубликован");

  const checkedAt = input.checkedAt ? new Date(input.checkedAt) : null;
  const row = await prisma.mysteryShopperResult.upsert({
    where: { employeeUserId_periodMonth_periodYear: { employeeUserId: input.employeeUserId, periodMonth: input.month, periodYear: input.year } },
    update: { score: input.score, checkedAt, comment: input.comment ?? null },
    create: {
      employeeUserId: input.employeeUserId, periodMonth: input.month, periodYear: input.year,
      score: input.score, checkedAt, comment: input.comment ?? null,
      status: "DRAFT", createdByUserId: actorUserId,
    },
  });
  await writeRatingAudit(prisma, {
    actorUserId,
    action: existing ? "MYSTERY_UPDATE" : "MYSTERY_CREATE",
    entityType: "MysteryShopperResult",
    entityId: row.id,
    month: input.month,
    year: input.year,
    after: { score: row.score },
  });
  return row;
}

export async function publishMystery(actorUserId: string, resultId: string) {
  const existing = await prisma.mysteryShopperResult.findUnique({ where: { id: resultId } });
  if (!existing) throw new AuthError(404, "mystery_not_found");
  if (existing.status === "PUBLISHED") return existing; // idempotent

  const row = await prisma.mysteryShopperResult.update({
    where: { id: resultId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await writeRatingAudit(prisma, {
    actorUserId, action: "MYSTERY_PUBLISH", entityType: "MysteryShopperResult", entityId: row.id,
    month: row.periodMonth, year: row.periodYear, after: { score: row.score, status: "PUBLISHED" },
  });
  // MYSTERY_90/95/100 become earnable once a result is published.
  await evaluateMysteryAchievements(row.employeeUserId);
  return row;
}
