import type { ManagementEmployeeTestSummaryDTO } from "@/lib/api/cabinet-types";

/**
 * Management Round E1 — pure aggregation logic, no DB/server-only import
 * (same reasoning as scope-core.ts's own header comment: kept separate so
 * this has real, DB-free test coverage instead of living only inline in
 * employee-card.ts, which IS server-only). The caller (employee-card.ts)
 * does exactly two Prisma queries — one QuizAttempt.findMany across every
 * quiz this employee has ever attempted, one Quiz.findMany for titles —
 * and hands the plain rows to this function; nothing here touches a
 * database or re-queries per quiz.
 */

export interface RawQuizAttempt {
  quizId: string;
  scorePercent: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * One summary row per distinct quizId in `attempts` — never per lesson,
 * never fabricated for a quiz with zero attempts (callers only ever pass
 * attempts that genuinely exist). `attempts` MUST already be ordered by
 * startedAt DESCENDING (the caller's query does this) — "latest" is
 * defined as the FIRST attempt seen per quizId in that order, the same
 * "first-seen-in-desc-order wins" convention cabinet-dashboards.ts's own
 * loadLatestQuizResults already uses; "best" is MAX(scorePercent) across
 * every attempt for that quiz, independent of recency. Only the four
 * scalar fields on RawQuizAttempt are ever read — never a quiz's
 * questions/options/correct-answer data, which this function's input type
 * does not even carry.
 */
export function aggregateQuizAttempts(
  attempts: RawQuizAttempt[],
  titleById: Map<string, string>,
): ManagementEmployeeTestSummaryDTO[] {
  const byQuiz = new Map<string, { latest: RawQuizAttempt; bestPercent: number; attemptCount: number }>();
  for (const a of attempts) {
    const existing = byQuiz.get(a.quizId);
    if (!existing) {
      byQuiz.set(a.quizId, { latest: a, bestPercent: a.scorePercent, attemptCount: 1 });
    } else {
      existing.bestPercent = Math.max(existing.bestPercent, a.scorePercent);
      existing.attemptCount += 1;
      // existing.latest is never reassigned — attempts arrive in descending
      // startedAt order, so the first one seen per quizId is already the
      // most recent.
    }
  }

  return [...byQuiz.entries()].map(([quizId, v]) => ({
    quizId,
    title: titleById.get(quizId) ?? "—",
    passed: v.latest.passed,
    latestPercent: v.latest.scorePercent,
    bestPercent: v.bestPercent,
    lastAttemptAt: (v.latest.completedAt ?? v.latest.startedAt).toISOString(),
    attemptCount: v.attemptCount,
  }));
}
