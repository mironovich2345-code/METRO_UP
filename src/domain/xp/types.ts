/**
 * XP domain — personal progress only.
 *
 * XP NEVER affects the career level, the monthly rating, or awards. The balance
 * is always derived as the sum of individual transactions (never a single
 * stored number), so history stays auditable and API-ready.
 */

export type XPReason =
  | "LESSON_COMPLETED"
  | "TEST_COMPLETED"
  | "PERFECT_TEST"
  | "LOGIN_STREAK"
  | "SPECIAL_EVENT";

export interface XPTransaction {
  id: string;
  employeeId: string;
  amount: number;
  reason: XPReason;
  /** ISO timestamp. */
  createdAt: string;
}

export interface XPBalance {
  /** Sum of all transactions. */
  total: number;
  /** Sum of transactions dated today. */
  today: number;
  /** Most recent transactions, newest first. */
  recent: XPTransaction[];
}

export interface XPReasonMeta {
  label: string;
  icon: string;
}
