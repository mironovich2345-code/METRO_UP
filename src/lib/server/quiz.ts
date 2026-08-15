import type { QuestionType } from "@prisma/client";
import type {
  PublicQuizDTO,
  QuizSubmitResultDTO,
  QuizQuestionResultDTO,
  LastQuizAttemptDTO,
} from "@/lib/api/content-types";
import type { QuizSubmitInput, QuizUpsertInput } from "./content-schemas";

/**
 * Quiz structure validation + server-side grading. Answer keys (`isCorrect`) and
 * explanations are NEVER exposed to the client before submission — grading runs
 * entirely on the server from the DB.
 */

export interface QuizValidationError {
  questionIndex: number | null;
  code: string;
  message: string;
}

/** Enforce the per-type option rules (section 22). Returns [] when valid. */
export function validateQuizStructure(input: QuizUpsertInput): QuizValidationError[] {
  const errors: QuizValidationError[] = [];
  if (input.passingPercent < 1 || input.passingPercent > 100) {
    errors.push({ questionIndex: null, code: "BAD_PASSING", message: "Проходной балл 1–100%" });
  }
  input.questions.forEach((q, i) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "SINGLE_CHOICE" && correct !== 1) {
      errors.push({ questionIndex: i, code: "SINGLE_NEEDS_ONE", message: "SINGLE_CHOICE: ровно 1 правильный" });
    }
    if (q.type === "MULTIPLE_CHOICE" && correct < 1) {
      errors.push({ questionIndex: i, code: "MULTI_NEEDS_ONE", message: "MULTIPLE_CHOICE: минимум 1 правильный" });
    }
    if (q.type === "TRUE_FALSE") {
      if (q.options.length !== 2) {
        errors.push({ questionIndex: i, code: "TF_NEEDS_TWO", message: "TRUE_FALSE: ровно 2 варианта" });
      }
      if (correct !== 1) {
        errors.push({ questionIndex: i, code: "TF_NEEDS_ONE", message: "TRUE_FALSE: ровно 1 правильный" });
      }
    }
  });
  return errors;
}

/* --------------------------- grading (DB shape) -------------------------- */

export interface GradableOption {
  id: string;
  isCorrect: boolean;
}
export interface GradableQuestion {
  id: string;
  type: QuestionType;
  explanation: string | null;
  options: GradableOption[];
}
export interface GradableQuiz {
  passingPercent: number;
  questions: GradableQuestion[];
}

function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Grade a submission against the quiz. Pure — no side effects. */
export function gradeQuiz(
  quiz: GradableQuiz,
  submission: QuizSubmitInput,
): Omit<QuizSubmitResultDTO, "attemptNumber" | "lessonCompleted" | "xpAwarded"> {
  const answerMap = new Map<string, Set<string>>();
  for (const a of submission.answers) answerMap.set(a.questionId, new Set(a.optionIds));

  const results: QuizQuestionResultDTO[] = [];
  let correctCount = 0;

  for (const q of quiz.questions) {
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const picked = answerMap.get(q.id) ?? new Set<string>();
    // Only correct option ids can count — ignore ids not belonging to this question.
    const validPicked = new Set([...picked].filter((id) => q.options.some((o) => o.id === id)));
    const correct = setEq(validPicked, new Set(correctIds));
    if (correct) correctCount += 1;
    results.push({
      questionId: q.id,
      correct,
      correctOptionIds: correctIds,
      explanation: q.explanation,
    });
  }

  const total = quiz.questions.length || 1;
  const scorePercent = Math.round((correctCount / total) * 100);
  const passed = scorePercent >= quiz.passingPercent;
  return { scorePercent, passed, results };
}

/** Whether a perfect score was achieved (drives PERFECT_QUIZ bonus). */
export function isPerfect(result: { scorePercent: number }): boolean {
  return result.scorePercent === 100;
}

/* ------------------------------ public DTO ------------------------------- */

export interface QuizWithGraph {
  id: string;
  title: string;
  description: string | null;
  passingPercent: number;
  maxAttempts: number | null;
  xpReward: number;
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    order: number;
    options: { id: string; text: string; order: number }[];
  }[];
}

/** Strip answer keys → the shape safe to send to the employee before submit. */
export function toPublicQuizDTO(
  quiz: QuizWithGraph,
  attemptsUsed: number,
  lastAttempt: LastQuizAttemptDTO | null = null,
): PublicQuizDTO {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passingPercent: quiz.passingPercent,
    maxAttempts: quiz.maxAttempts,
    attemptsUsed,
    xpReward: quiz.xpReward,
    lastAttempt,
    questions: quiz.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        order: q.order,
        options: q.options
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((o) => ({ id: o.id, text: o.text, order: o.order })),
      })),
  };
}
