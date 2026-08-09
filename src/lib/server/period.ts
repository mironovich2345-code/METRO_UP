import "server-only";
import type { RatingPeriod } from "@prisma/client";
import { prisma } from "./db";
import { appMonthYear } from "./time";
import { ruMonthYear } from "@/lib/labels";

/**
 * RatingPeriod lifecycle. The working rating period is the PREVIOUS calendar
 * month; the current (incomplete) month may not be published in the MVP.
 */
export function previousCalendarMonth(now: Date = new Date()): { month: number; year: number } {
  const { month, year } = appMonthYear(now);
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export function periodLabel(month: number, year: number): string {
  return ruMonthYear(month, year);
}

/** Only for SPM workflow — never call on a plain employee GET. */
export async function getOrCreatePeriod(month: number, year: number): Promise<RatingPeriod> {
  return prisma.ratingPeriod.upsert({
    where: { month_year: { month, year } },
    update: {},
    create: { month, year },
  });
}

export async function getPeriod(month: number, year: number): Promise<RatingPeriod | null> {
  return prisma.ratingPeriod.findUnique({ where: { month_year: { month, year } } });
}

/** A period is publishable only if it is a completed calendar month. */
export function isPublishablePeriod(month: number, year: number, now: Date = new Date()): boolean {
  const cur = appMonthYear(now);
  return year < cur.year || (year === cur.year && month < cur.month);
}
