import type { XPReason, XPReasonMeta, XPTransaction } from "./types";

export const XP_REASON_META: Record<XPReason, XPReasonMeta> = {
  LESSON_COMPLETED: { label: "Урок пройден", icon: "BookOpen" },
  TEST_COMPLETED: { label: "Тест сдан", icon: "ClipboardCheck" },
  PERFECT_TEST: { label: "Тест без ошибок", icon: "Sparkles" },
  LOGIN_STREAK: { label: "Серия входов", icon: "Flame" },
  SPECIAL_EVENT: { label: "Особое событие", icon: "Award" },
};

/** ISO timestamp `days` days before `now` (at a fixed hour for stability). */
function daysAgo(now: Date, days: number, hour = 10): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Mock XP ledger for the current employee. Built relative to `now` so the
 * "today" bucket is populated during a demo. A function (not a const) keeps
 * `Date` out of module scope and the client render path deterministic.
 */
export function getXpTransactions(
  employeeId: string,
  now: Date,
): XPTransaction[] {
  const tx = (
    id: string,
    amount: number,
    reason: XPReason,
    days: number,
    hour = 10,
  ): XPTransaction => ({
    id,
    employeeId,
    amount,
    reason,
    createdAt: daysAgo(now, days, hour),
  });

  return [
    // Today
    tx("xp-1", 30, "LESSON_COMPLETED", 0, 9),
    tx("xp-2", 70, "TEST_COMPLETED", 0, 12),
    // Earlier
    tx("xp-3", 40, "LOGIN_STREAK", 1, 8),
    tx("xp-4", 30, "LESSON_COMPLETED", 1, 15),
    tx("xp-5", 100, "PERFECT_TEST", 2, 11),
    tx("xp-6", 30, "LESSON_COMPLETED", 2, 16),
    tx("xp-7", 40, "LOGIN_STREAK", 3, 8),
    tx("xp-8", 30, "LESSON_COMPLETED", 4, 14),
    tx("xp-9", 250, "SPECIAL_EVENT", 6, 19),
    tx("xp-10", 70, "TEST_COMPLETED", 8, 13),
  ];
}
