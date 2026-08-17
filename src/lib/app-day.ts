/**
 * The business calendar day as `YYYY-MM-DD`, in the app timezone (default
 * Europe/Moscow). This mirrors the SERVER's appDay (src/lib/server/time.ts) so
 * client date pickers (e.g. the manager's «План дня» board) don't drift to a
 * different day for users outside Moscow — the plan is keyed to the business day,
 * not the browser's local day.
 */
export const APP_TZ = "Europe/Moscow";

export function appDateString(now: Date = new Date(), tz: string = APP_TZ): string {
  // en-CA formats as ISO-like YYYY-MM-DD; timeZone applies the business day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
}
