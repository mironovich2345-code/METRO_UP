import { ruMonthYear } from "./labels";

export interface Period { month: number; year: number }

/** Previous calendar month (client-side default working period). */
export function prevCalendarMonth(now: Date = new Date()): Period {
  const m = now.getMonth(); // 0-based current month
  return m === 0 ? { month: 12, year: now.getFullYear() - 1 } : { month: m, year: now.getFullYear() };
}

/** The last `n` calendar months (excluding the current, incomplete one). */
export function lastCompletedMonths(n = 12, now: Date = new Date()): Period[] {
  const out: Period[] = [];
  let p = prevCalendarMonth(now);
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = p.month === 1 ? { month: 12, year: p.year - 1 } : { month: p.month - 1, year: p.year };
  }
  return out;
}

export function periodKey(p: Period): string {
  return `${p.year}-${p.month}`;
}
export function periodLabel(p: Period): string {
  return ruMonthYear(p.month, p.year);
}
