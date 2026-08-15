import type { QuizQuestionResultDTO } from "@/lib/api/content-types";

/**
 * Presentation helpers for quiz results (pure — no React/server, unit testable).
 * The score PERCENT is the server's source of truth (`scorePercent`); the client
 * only DERIVES the "N из M" counts from the per-question results it received —
 * it never recomputes or overrides the pass/fail decision.
 */

/** Correct-answer counts derived from the server's per-question results. */
export function scoreCounts(results: Pick<QuizQuestionResultDTO, "correct">[]): {
  correctCount: number;
  total: number;
} {
  return {
    correctCount: results.filter((r) => r.correct).length,
    total: results.length,
  };
}

/** Retry is allowed while attempts remain (unlimited when maxAttempts is null). */
export function canRetry(maxAttempts: number | null, attemptsUsed: number): boolean {
  return maxAttempts == null || attemptsUsed < maxAttempts;
}

/** Attempts remaining, or null for unlimited. */
export function attemptsLeft(maxAttempts: number | null, attemptsUsed: number): number | null {
  return maxAttempts == null ? null : Math.max(0, maxAttempts - attemptsUsed);
}

/** Start CTA copy: first-time vs a repeat run. */
export function startLabel(attemptsUsed: number): string {
  return attemptsUsed > 0 ? "Пройти тест ещё раз" : "Начать тест";
}
