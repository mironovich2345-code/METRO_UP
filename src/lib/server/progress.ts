import "server-only";
import { Prisma, type XPReason } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { gradeQuiz, isPerfect } from "./quiz";
import { resolveLessonAccess, programIdForLesson } from "./gating";
import { appDay } from "./time";
import { evaluateAchievements } from "./achievements";
import type {
  LessonCompleteResultDTO,
  QuizSubmitResultDTO,
  XPBalanceDTO,
} from "@/lib/api/content-types";
import type { QuizSubmitInput } from "./content-schemas";

/**
 * Learning progress + XP. Completion is atomic and idempotent:
 *  - LessonProgress has a unique (userId, lessonId).
 *  - XPTransaction has a unique (userId, reason, sourceType, sourceId), so a
 *    repeated completion never grants XP twice (createMany skipDuplicates).
 * XP balance is always SUM(XPTransaction.amount) — never a stored scalar.
 */

const PERFECT_QUIZ_BONUS = 10; // small fixed bonus; quiz/lesson XP come from CMS.

type Tx = Prisma.TransactionClient;

/** Grant XP idempotently; returns the amount actually inserted (0 if duplicate). */
async function grantXp(
  tx: Tx,
  input: { userId: string; reason: XPReason; amount: number; sourceType: string; sourceId: string | null },
): Promise<number> {
  if (input.amount <= 0) return 0;
  const res = await tx.xPTransaction.createMany({
    data: [
      {
        userId: input.userId,
        reason: input.reason,
        amount: input.amount,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    ],
    skipDuplicates: true,
  });
  return res.count > 0 ? input.amount : 0;
}

/** Mark a lesson IN_PROGRESS (never downgrades a COMPLETED lesson). */
export async function startLesson(userId: string, lessonId: string): Promise<void> {
  const existing = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  if (existing?.status === "COMPLETED") return;
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    update: { status: "IN_PROGRESS", startedAt: existing?.startedAt ?? new Date() },
    create: { userId, lessonId, status: "IN_PROGRESS", startedAt: new Date() },
  });
}

async function assertUnlocked(userId: string, lessonId: string): Promise<void> {
  const programId = await programIdForLesson(lessonId);
  if (!programId) throw new AuthError(404, "lesson_not_found");
  const { access, index } = await resolveLessonAccess(userId, lessonId, programId);
  if (index < 0) throw new AuthError(404, "lesson_not_found");
  if (access.locked) throw new AuthError(403, "lesson_locked", access.reason ?? undefined);
}

/**
 * Complete a lesson WITHOUT a quiz (explicit "Завершить урок" CTA). Idempotent:
 * a second call does not create a duplicate completion or duplicate XP.
 */
export async function completeLesson(
  userId: string,
  lessonId: string,
): Promise<LessonCompleteResultDTO> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { quiz: { select: { id: true } } },
  });
  if (!lesson || lesson.status !== "PUBLISHED") throw new AuthError(404, "lesson_not_found");
  await assertUnlocked(userId, lessonId);

  if (lesson.quiz) {
    // A lesson with a quiz can only be completed by passing the quiz.
    throw new AuthError(409, "quiz_required", "Урок завершается прохождением теста");
  }

  const xpAwarded = await prisma.$transaction(async (tx) => {
    const existing = await tx.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    await tx.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { status: "COMPLETED", completedAt: existing?.completedAt ?? new Date() },
      create: { userId, lessonId, status: "COMPLETED", startedAt: new Date(), completedAt: new Date() },
    });
    return grantXp(tx, {
      userId,
      reason: "LESSON_COMPLETED",
      amount: lesson.xpReward,
      sourceType: "LESSON",
      sourceId: lessonId,
    });
  });

  // Idempotent achievement re-evaluation from real progress (FIRST_LESSON, …).
  await evaluateAchievements(userId);

  const programId = await programIdForLesson(lessonId);
  const { next } = await resolveLessonAccess(userId, lessonId, programId!);
  return { lessonCompleted: true, xpAwarded, next };
}

/**
 * Submit a quiz. Grades server-side, records the attempt, and — on pass —
 * completes the lesson and grants quiz + lesson XP atomically & idempotently.
 */
export async function submitQuiz(
  userId: string,
  lessonId: string,
  submission: QuizSubmitInput,
): Promise<QuizSubmitResultDTO> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      quiz: { include: { questions: { include: { options: true } } } },
    },
  });
  if (!lesson || lesson.status !== "PUBLISHED") throw new AuthError(404, "lesson_not_found");
  if (!lesson.quiz) throw new AuthError(400, "no_quiz");
  await assertUnlocked(userId, lessonId);

  const quiz = lesson.quiz;
  const attemptsUsed = await prisma.quizAttempt.count({ where: { userId, quizId: quiz.id } });
  if (quiz.maxAttempts != null && attemptsUsed >= quiz.maxAttempts) {
    throw new AuthError(409, "no_attempts_left", "Попытки закончились");
  }

  const graded = gradeQuiz(
    { passingPercent: quiz.passingPercent, questions: quiz.questions },
    submission,
  );

  const result = await prisma.$transaction(async (tx) => {
    // Attempt number is (used + 1); unique constraint guards against double-tap.
    let attemptNumber = attemptsUsed + 1;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await tx.quizAttempt.create({
          data: {
            userId,
            quizId: quiz.id,
            attemptNumber,
            scorePercent: graded.scorePercent,
            passed: graded.passed,
            completedAt: new Date(),
            answers: submission as unknown as Prisma.InputJsonValue,
          },
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          attemptNumber += 1;
          continue;
        }
        throw e;
      }
    }

    let xpAwarded = 0;
    let lessonCompleted = false;
    if (graded.passed) {
      xpAwarded += await grantXp(tx, {
        userId, reason: "QUIZ_COMPLETED", amount: quiz.xpReward,
        sourceType: "QUIZ", sourceId: quiz.id,
      });
      if (isPerfect(graded)) {
        xpAwarded += await grantXp(tx, {
          userId, reason: "PERFECT_QUIZ", amount: PERFECT_QUIZ_BONUS,
          sourceType: "QUIZ", sourceId: quiz.id,
        });
      }
      const existing = await tx.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      });
      await tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { status: "COMPLETED", completedAt: existing?.completedAt ?? new Date() },
        create: { userId, lessonId, status: "COMPLETED", startedAt: new Date(), completedAt: new Date() },
      });
      xpAwarded += await grantXp(tx, {
        userId, reason: "LESSON_COMPLETED", amount: lesson.xpReward,
        sourceType: "LESSON", sourceId: lessonId,
      });
      lessonCompleted = true;
    }
    return { attemptNumber, xpAwarded, lessonCompleted };
  });

  // Idempotent achievement re-evaluation (PERFECT_QUIZ, FIRST_LESSON on pass, …).
  await evaluateAchievements(userId);

  return {
    attemptNumber: result.attemptNumber,
    scorePercent: graded.scorePercent,
    passed: graded.passed,
    lessonCompleted: result.lessonCompleted,
    xpAwarded: result.xpAwarded,
    results: graded.results,
  };
}

export async function getXpBalance(userId: string): Promise<XPBalanceDTO> {
  const dayStart = appDay(); // app-timezone midnight
  const [agg, todayAgg, recent] = await Promise.all([
    prisma.xPTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.xPTransaction.aggregate({
      where: { userId, createdAt: { gte: dayStart } },
      _sum: { amount: true },
    }),
    prisma.xPTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return {
    total: agg._sum.amount ?? 0,
    today: todayAgg._sum.amount ?? 0,
    recent: recent.map((t) => ({
      amount: t.amount,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
