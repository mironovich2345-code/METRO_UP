import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { computeSalesScore } from "./rating-formula";
import { getRankingEmployees, type EmployeeFilter } from "./employees";
import { getPeriod } from "./period";
import { writeRatingAudit } from "./rating-audit";
import type { SpmSalesRowDTO } from "@/lib/api/spm-types";

/**
 * Sales inputs. Money (personalPlan/personalFact) is stored as integer whole
 * rubles — exact, never a JS float source of truth. salesScore is server-derived
 * (SPM can never submit it): fact/plan*100 capped at 120; null when plan <= 0.
 */
export async function getSalesRows(
  month: number,
  year: number,
  filter?: EmployeeFilter,
): Promise<SpmSalesRowDTO[]> {
  const employees = await getRankingEmployees(filter);
  const inputs = await prisma.monthlySalesInput.findMany({
    where: { month, year, employeeUserId: { in: employees.map((e) => e.employeeUserId) } },
  });
  const byUser = new Map(inputs.map((i) => [i.employeeUserId, i]));
  return employees.map((e) => {
    const i = byUser.get(e.employeeUserId);
    return {
      ...e,
      personalPlan: i?.personalPlan ?? null,
      personalFact: i?.personalFact ?? null,
      salesScore: i?.salesScore ?? null,
    };
  });
}

export async function upsertSales(
  actorUserId: string,
  input: { employeeUserId: string; month: number; year: number; personalPlan: number; personalFact: number },
) {
  if (!Number.isInteger(input.personalPlan) || input.personalPlan < 0)
    throw new AuthError(400, "invalid_plan", "План должен быть целым числом ≥ 0");
  if (!Number.isInteger(input.personalFact) || input.personalFact < 0)
    throw new AuthError(400, "invalid_fact", "Факт должен быть целым числом ≥ 0");

  const period = await getPeriod(input.month, input.year);
  if (period?.status === "PUBLISHED")
    throw new AuthError(409, "period_published", "Период опубликован — верните его в работу");

  const salesScore = computeSalesScore(input.personalPlan, input.personalFact);
  const existing = await prisma.monthlySalesInput.findUnique({
    where: { employeeUserId_month_year: { employeeUserId: input.employeeUserId, month: input.month, year: input.year } },
  });

  const row = await prisma.monthlySalesInput.upsert({
    where: { employeeUserId_month_year: { employeeUserId: input.employeeUserId, month: input.month, year: input.year } },
    update: { personalPlan: input.personalPlan, personalFact: input.personalFact, salesScore, enteredByUserId: actorUserId },
    create: {
      employeeUserId: input.employeeUserId, month: input.month, year: input.year,
      personalPlan: input.personalPlan, personalFact: input.personalFact, salesScore, enteredByUserId: actorUserId,
    },
  });
  await writeRatingAudit(prisma, {
    actorUserId,
    action: existing ? "SALES_UPDATE" : "SALES_CREATE",
    entityType: "MonthlySalesInput",
    entityId: row.id,
    month: input.month,
    year: input.year,
    before: existing ? { personalPlan: existing.personalPlan, personalFact: existing.personalFact } : null,
    after: { personalPlan: row.personalPlan, personalFact: row.personalFact, salesScore: row.salesScore },
  });
  return row;
}
