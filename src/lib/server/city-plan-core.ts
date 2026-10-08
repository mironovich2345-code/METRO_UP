/**
 * Management Round E2.1 — pure, DB-free sort logic pulled out of
 * city-plan.ts (which carries `import "server-only"` and therefore can't
 * be imported directly from a node:test file) into this sibling file
 * specifically for direct unit coverage. Mirrors this engagement's own
 * extraction precedent (scope-core.ts, employee-card-core.ts).
 *
 * Sort: date ascending (plain string compare is safe — dates are always
 * YYYY-MM-DD), then within the same date, incomplete tasks before
 * completed/skipped ones. Never a second query — this runs once, in
 * memory, over the one bounded result set getCityManagerDelegatedTasks
 * already fetched.
 */

export interface DelegatedTaskRow {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  status: "TODO" | "COMPLETED" | "SKIPPED";
}

export function sortDelegatedTasks<T extends DelegatedTaskRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const aDone = a.status !== "TODO" ? 1 : 0;
    const bDone = b.status !== "TODO" ? 1 : 0;
    return aDone - bDone;
  });
}
