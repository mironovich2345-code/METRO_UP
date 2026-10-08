import { round1 } from "./rating-formula";
import { ruMonthYear } from "@/lib/labels";
import type {
  ManagementMysteryShopperClubRowDTO,
  ManagementMysteryShopperEmployeeRowDTO,
  MysteryShopperPeriodDTO,
} from "@/lib/api/cabinet-types";

/**
 * Management Round E3 — pure, DB-free Mystery Shopper aggregation logic,
 * pulled out of mystery-shopper.ts (which carries `import "server-only"`
 * and therefore can't be imported from a node:test file) into this sibling
 * file for direct unit coverage. Mirrors this engagement's own extraction
 * precedent (scope-core.ts, employee-card-core.ts, city-plan-core.ts).
 *
 * Every function here operates on rows the caller already fetched in ONE
 * bounded query — nothing here ever issues a second query, nothing here
 * ever runs once per employee/club (see mystery-shopper.ts's own
 * performance doc comment).
 */

export interface MysteryResultRow {
  employeeUserId: string;
  periodMonth: number;
  periodYear: number;
  score: number;
}

/**
 * Distinct (month, year) pairs actually present in `rows`, sorted newest
 * first. A pure derivation from whatever PUBLISHED rows the caller already
 * fetched for its authorized scope — never a second query, and never a
 * fabricated "current month" entry for a period with zero real rows
 * (round brief section 7's explicit "do not fabricate empty months").
 */
export function derivePeriods(rows: Pick<MysteryResultRow, "periodMonth" | "periodYear">[]): MysteryShopperPeriodDTO[] {
  const seen = new Map<string, MysteryShopperPeriodDTO>();
  for (const r of rows) {
    const key = `${r.periodYear}-${r.periodMonth}`;
    if (!seen.has(key)) {
      seen.set(key, { month: r.periodMonth, year: r.periodYear, label: ruMonthYear(r.periodMonth, r.periodYear) });
    }
  }
  return [...seen.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

/**
 * The period to render: the requested one if the caller supplied a
 * syntactically real month+year (an honest "zero results for this period"
 * is not fabrication — the DB is still the one deciding whether anything
 * real exists for it), else the latest entry in `periods`, else null when
 * `periods` is empty (section 7's "if no PUBLISHED result exists anywhere
 * in scope, show an honest empty state").
 */
export function pickSelectedPeriod(
  periods: MysteryShopperPeriodDTO[],
  requested: { month: number | null; year: number | null },
): MysteryShopperPeriodDTO | null {
  if (requested.month != null && requested.year != null) {
    return { month: requested.month, year: requested.year, label: ruMonthYear(requested.month, requested.year) };
  }
  return periods[0] ?? null;
}

/**
 * Arithmetic mean of real PUBLISHED scores only, rounded to the same
 * one-decimal convention this codebase already uses for every other
 * aggregate percentage (rating-formula.ts's own round1,
 * cabinet-dashboards.ts's summarizeTraining) — section 18's explicit "do
 * not invent decimal precision inconsistent with existing UI". null when
 * there is nothing to average — never a fabricated 0.
 */
export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return round1(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export interface MysteryEmployeeInput {
  userId: string;
  displayName: string;
  position: string | null;
}

/**
 * One row per CURRENT employee, same order given — a result-less employee
 * gets `score: null` (section 8's explicit "do NOT fabricate 0%",
 * "employees without a result should appear"), never omitted and never a
 * zero.
 */
export function buildEmployeeRows(
  employees: MysteryEmployeeInput[],
  scoreByUserId: Map<string, number>,
): ManagementMysteryShopperEmployeeRowDTO[] {
  return employees.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    position: e.position,
    score: scoreByUserId.get(e.userId) ?? null,
  }));
}

export interface MysteryClubInput {
  id: string;
  name: string;
}

/**
 * Per-club average/count, each computed independently from THAT club's
 * own current employees' scores only — section 9's explicit anti-pattern:
 * this must never be averaged again into a "city = mean(club averages)"
 * figure (that would incorrectly weight a 2-person club the same as a
 * 20-person one). The caller computes the city-wide summary separately,
 * directly over the full flat `scoreByUserId` map — see
 * mystery-shopper.ts's getCityMysteryShopper.
 */
export function buildClubRows(
  clubs: MysteryClubInput[],
  employeeUserIdsByClub: Map<string, string[]>,
  scoreByUserId: Map<string, number>,
): ManagementMysteryShopperClubRowDTO[] {
  return clubs.map((club) => {
    const userIds = employeeUserIdsByClub.get(club.id) ?? [];
    const scores = userIds.map((id) => scoreByUserId.get(id)).filter((s): s is number => s != null);
    return { clubId: club.id, clubName: club.name, summary: { averageScore: averageScore(scores), resultCount: scores.length } };
  });
}

/**
 * Query-string -> {month, year} parsing for GET
 * /api/control/cabinet/mystery-shopper. Both must be present and
 * syntactically valid together, or neither is honored (falls back to the
 * latest-available default) — never a half-applied filter (e.g. "month=6"
 * alone silently matching every year). A nonsensical-but-well-formed pair
 * (e.g. a future year with no data) is NOT rejected here — it legitimately
 * resolves to zero results downstream, which is an honest empty state, not
 * a security concern (the scope-bounding WHERE clause is applied
 * independently by the caller).
 */
export function parsePeriodQuery(
  monthRaw: string | null,
  yearRaw: string | null,
): { periodMonth: number | null; periodYear: number | null } {
  if (monthRaw == null || yearRaw == null) return { periodMonth: null, periodYear: null };
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) return { periodMonth: null, periodYear: null };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { periodMonth: null, periodYear: null };
  return { periodMonth: month, periodYear: year };
}
