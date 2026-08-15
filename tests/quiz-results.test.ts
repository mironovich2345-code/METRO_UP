import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeQuiz, type GradableQuiz } from "../src/lib/server/quiz";
import { scoreCounts, canRetry, attemptsLeft, startLabel } from "../src/lib/quiz-format";

/**
 * Quiz results + retry. The server grader (`gradeQuiz`) is pure and tested
 * directly here; the presentation helpers derive counts/labels from its output.
 * DB/HTTP/DOM scenarios are explicit integration skips (see the manual Railway
 * checklist in the final report).
 */

/** Build N single-choice questions where option "a" is correct. */
function quiz(passingPercent: number, n: number): GradableQuiz {
  return {
    passingPercent,
    questions: Array.from({ length: n }, (_, i) => ({
      id: `q${i + 1}`,
      type: "SINGLE_CHOICE" as const,
      explanation: i === 0 ? "Пояснение" : null,
      options: [
        { id: `q${i + 1}a`, isCorrect: true },
        { id: `q${i + 1}b`, isCorrect: false },
      ],
    })),
  };
}
/** Answer the first `correct` questions right, the rest wrong. */
function answers(n: number, correct: number) {
  return {
    answers: Array.from({ length: n }, (_, i) => ({
      questionId: `q${i + 1}`,
      optionIds: [i < correct ? `q${i + 1}a` : `q${i + 1}b`],
    })),
  };
}

/* ------------------------------- grading -------------------------------- */

test("A: 4 of 5 correct → 80%", () => {
  const g = gradeQuiz(quiz(80, 5), answers(5, 4));
  assert.equal(g.scorePercent, 80);
});

test("B: per-question results give correctCount=4, total=5", () => {
  const g = gradeQuiz(quiz(80, 5), answers(5, 4));
  const { correctCount, total } = scoreCounts(g.results);
  assert.equal(correctCount, 4);
  assert.equal(total, 5);
});

test("C: passed when score >= passingScore (80 ≥ 80)", () => {
  assert.equal(gradeQuiz(quiz(80, 5), answers(5, 4)).passed, true);
  assert.equal(gradeQuiz(quiz(80, 5), answers(5, 5)).passed, true); // 100%
});

test("D: failed 3/5 (60%) when passingScore=80", () => {
  const g = gradeQuiz(quiz(80, 5), answers(5, 3));
  assert.equal(g.scorePercent, 60);
  assert.equal(g.passed, false);
});

test("percent is an integer (rounded), not a fraction", () => {
  const g = gradeQuiz(quiz(50, 3), answers(3, 1)); // 1/3
  assert.equal(g.scorePercent, 33);
  assert.equal(Number.isInteger(g.scorePercent), true);
});

test("results never leak answer keys before submit is not applicable — grader returns keys only in the result", () => {
  const g = gradeQuiz(quiz(80, 1), answers(1, 1));
  assert.deepEqual(g.results[0].correctOptionIds, ["q1a"]);
  assert.equal(g.results[0].explanation, "Пояснение");
});

/* --------------------------- retry / attempts --------------------------- */

test("E: unlimited attempts (maxAttempts=null) → retry always allowed", () => {
  assert.equal(canRetry(null, 0), true);
  assert.equal(canRetry(null, 99), true);
  assert.equal(attemptsLeft(null, 5), null);
});

test("F: 1 of 3 attempts used → retry allowed", () => {
  assert.equal(canRetry(3, 1), true);
  assert.equal(attemptsLeft(3, 1), 2);
});

test("G: 3 of 3 attempts used → retry denied", () => {
  assert.equal(canRetry(3, 3), false);
  assert.equal(attemptsLeft(3, 3), 0);
});

test("start label switches from «Начать тест» to «Пройти тест ещё раз»", () => {
  assert.equal(startLabel(0), "Начать тест");
  assert.equal(startLabel(1), "Пройти тест ещё раз");
});

/* ------------------ integration scenarios (require Postgres/DOM) --------- */

const skip = { skip: "integration: requires Postgres / HTTP / DOM" } as const;
test("H: retry creates a new QuizAttempt (attemptNumber increments)", skip, () => {});
test("I: previous QuizAttempt is preserved (no hard delete/mutation)", skip, () => {});
test("J: a passed quiz can be retaken while attempts remain", skip, () => {});
test("K: repeat pass after lesson completion awards no duplicate XP", skip, () => {});
test("L: failed quiz does not complete the lesson / no completion XP", skip, () => {});
test("M: answer keys are absent from the pre-submit lesson DTO", skip, () => {});
test("N: own latest result is returned to the authenticated user", skip, () => {});
test("O: another user's attempt cannot be read (scoped by session userId)", skip, () => {});
test("P: reopening the lesson returns the latest own attempt (lastAttempt)", skip, () => {});
test("Q: lesson editor scrolls with the wheel over any content (no leaked body lock)", skip, () => {});
test("R: Modal wheel scroll + background lock still work and release on close", skip, () => {});
