import { getXpTransactions } from "./data";
import type { XPBalance, XPTransaction } from "./types";

export * from "./types";
export { XP_REASON_META } from "./data";

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Derive an XP balance from a transaction list. Total is always the sum. */
export function computeBalance(
  transactions: XPTransaction[],
  now: Date,
  recentCount = 5,
): XPBalance {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const today = transactions
    .filter((t) => isSameDay(new Date(t.createdAt), now))
    .reduce((s, t) => s + t.amount, 0);
  const recent = [...transactions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, recentCount);
  return { total, today, recent };
}

/** Ready-to-render XP balance for an employee. */
export function getXPBalance(
  employeeId: string,
  now: Date = new Date(),
): XPBalance {
  return computeBalance(getXpTransactions(employeeId, now), now);
}
