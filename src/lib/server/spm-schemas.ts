import { z } from "zod";

const month = z.number().int().min(1).max(12);
const year = z.number().int().min(2020).max(2100);

export const salesUpsertSchema = z.object({
  employeeUserId: z.string().uuid(),
  month,
  year,
  personalPlan: z.number().int().min(0),
  personalFact: z.number().int().min(0),
});

export const mysteryUpsertSchema = z.object({
  employeeUserId: z.string().uuid(),
  month,
  year,
  score: z.number().int().min(0).max(100),
  checkedAt: z.string().datetime().optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
});

export const eligibilitySchema = z.object({
  employeeUserId: z.string().uuid(),
  month,
  year,
  isEligible: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
});

export const periodActionSchema = z.object({ month, year });

/** Parse ?month=&year= from a URL, falling back to the previous calendar month. */
export function parsePeriodQuery(
  url: URL,
  fallback: { month: number; year: number },
): { month: number; year: number } {
  const m = Number(url.searchParams.get("month"));
  const y = Number(url.searchParams.get("year"));
  const okM = Number.isInteger(m) && m >= 1 && m <= 12;
  const okY = Number.isInteger(y) && y >= 2020 && y <= 2100;
  return okM && okY ? { month: m, year: y } : fallback;
}
