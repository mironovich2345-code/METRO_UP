/**
 * Application timezone abstraction. The product operates in a single business
 * timezone (Europe/Moscow by default, overridable via APP_TIMEZONE). Daily-plan
 * "today" is computed in this zone — not hardcoded to UTC — so a plan rolls over
 * at local midnight.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Moscow";

/** Calendar Y/M/D for `now` in the app timezone. */
export function appCalendarDate(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * The app-timezone "day" as a UTC-midnight Date, suitable for a Postgres `@db.Date`
 * column and for date-only equality/uniqueness.
 */
export function appDay(now: Date = new Date()): Date {
  const { year, month, day } = appCalendarDate(now);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Current month/year in the app timezone (1-based month). */
export function appMonthYear(now: Date = new Date()): { month: number; year: number } {
  const { year, month } = appCalendarDate(now);
  return { month, year };
}

/** True if `ts` falls on the app-timezone "today". */
export function isAppToday(ts: Date, now: Date = new Date()): boolean {
  const a = appCalendarDate(ts);
  const b = appCalendarDate(now);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
