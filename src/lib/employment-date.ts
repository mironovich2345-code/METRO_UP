/**
 * Sprint: LIVE QA QA-04, section A — pure rules for the employee's own
 * "Дата начала работы" (EmploymentAssignment.startedAt). No React, no Prisma,
 * no fetch — shared by the Profile sheet and PUT /api/profile/employment, and
 * directly unit-tested.
 *
 * DATE-ONLY SEMANTICS. The picker yields a calendar date ("2024-08-15"), not
 * an instant. It is stored as that date's UTC midnight and always formatted
 * back in UTC, so no viewer timezone can shift it to the previous or next
 * day. "Стаж" is derived from the stored value (formatTenureRu) and is never
 * editable on its own.
 */

/** The day the MetroFitness network started operating (QA-04.1). Nobody can
 * have started working in it earlier, so this is the business minimum for an
 * employment start date — enforced by the server (parseEmploymentStartDate)
 * and used as the picker's `min`. The ONLY place this date is written. */
export const METROFITNESS_NETWORK_STARTED_ON = "2015-12-05";

/** The furthest-ahead timezone on Earth is UTC+14: a date that is already
 * "today" somewhere is never rejected as future, whatever the server's own
 * clock zone. The picker's `max` still caps the user at their LOCAL today. */
const LATEST_TIMEZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const EMPLOYMENT_DATE_MESSAGES = {
  invalid_date: "Укажите корректную дату",
  future_date: "Дата не может быть в будущем",
  before_network_start: "Дата начала работы не может быть раньше 5 декабря 2015 года",
  before_previous_assignment: "Дата раньше окончания предыдущего места работы",
} as const;

export type EmploymentDateErrorCode = keyof typeof EMPLOYMENT_DATE_MESSAGES;

export type EmploymentDateValidation =
  | { ok: true; isoDate: string; date: Date }
  | { ok: false; code: Exclude<EmploymentDateErrorCode, "before_previous_assignment">; message: string };

/** "YYYY-MM-DD" -> a validated real calendar date at UTC midnight. Rejects
 * malformed strings, impossible dates (2024-02-30), dates before
 * METROFITNESS_NETWORK_STARTED_ON and dates that are in the future everywhere on Earth. */
export function parseEmploymentStartDate(input: unknown, now: Date = new Date()): EmploymentDateValidation {
  const fail = (code: "invalid_date" | "future_date" | "before_network_start") => ({ ok: false as const, code, message: EMPLOYMENT_DATE_MESSAGES[code] });
  if (typeof input !== "string") return fail("invalid_date");
  const match = ISO_DATE.exec(input.trim());
  if (!match) return fail("invalid_date");
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail("invalid_date");
  }
  const isoDate = `${y}-${m}-${d}`;
  if (isoDate < METROFITNESS_NETWORK_STARTED_ON) return fail("before_network_start");
  const latestToday = new Date(now.getTime() + LATEST_TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
  if (isoDate > latestToday) return fail("future_date");
  return { ok: true, isoDate, date };
}

/** The current employment period must not start before the previous (closed)
 * assignment ended — compared as calendar dates, so a same-day transfer is
 * allowed. */
export function startsBeforePreviousAssignment(isoDate: string, previousEndedAt: Date | null): boolean {
  if (!previousEndedAt) return false;
  return isoDate < previousEndedAt.toISOString().slice(0, 10);
}

/** Stored ISO instant -> the picker's "YYYY-MM-DD" value (UTC calendar date). */
export function employmentDateInputValue(startedAtIso: string | null): string {
  return startedAtIso ? startedAtIso.slice(0, 10) : "";
}

/** The viewer's LOCAL calendar date as "YYYY-MM-DD" — the picker's `max`. */
export function localTodayInputValue(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "15 августа 2024" — formatted in UTC so the stored calendar date is shown
 * exactly, in every timezone. */
export function formatEmploymentDateRu(startedAtIso: string): string {
  return new Date(startedAtIso)
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .replace(/\s*г\.$/, "");
}

/**
 * Which EmploymentAssignment write a validated self-edit performs — decided
 * purely, so "history is never overwritten" is unit-tested:
 * - `update` targets ONLY the open row (endedAt = null) by its id; closed
 *   rows are never candidates.
 * - `create` happens only when no open row exists, from the employee's real
 *   current EmployeeProfile club/position.
 * - `noop` when the open row already has this exact date.
 * - `reject` when the date precedes the previous (closed) assignment's end.
 */
export type EmploymentStartPlan<P extends string = string> =
  | { kind: "reject"; code: "before_previous_assignment" }
  | { kind: "noop"; startedAt: Date }
  | { kind: "update"; assignmentId: string; previousStartedAt: Date }
  | { kind: "create"; clubId: string; positionId: P };

export function planEmploymentStartChange<P extends string>(params: {
  isoDate: string;
  date: Date;
  open: { id: string; startedAt: Date } | null;
  previousEndedAt: Date | null;
  profile: { clubId: string; positionId: P };
}): EmploymentStartPlan<P> {
  if (startsBeforePreviousAssignment(params.isoDate, params.previousEndedAt)) {
    return { kind: "reject", code: "before_previous_assignment" };
  }
  if (params.open) {
    if (params.open.startedAt.getTime() === params.date.getTime()) return { kind: "noop", startedAt: params.open.startedAt };
    return { kind: "update", assignmentId: params.open.id, previousStartedAt: params.open.startedAt };
  }
  return { kind: "create", clubId: params.profile.clubId, positionId: params.profile.positionId };
}
