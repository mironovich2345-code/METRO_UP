import "server-only";
import { prisma } from "./db";
import { toLessonBlockDTOs } from "./content";
import { toPublicQuizDTO } from "./quiz";
import { resolveLessonAccess } from "./gating";
import type { LessonDetailDTO, LastQuizAttemptDTO } from "@/lib/api/content-types";

/**
 * Assemble the client-safe lesson detail for the employee player. In preview
 * mode (CMS) any status is visible, access is unlocked, and progress/next are
 * neutral — the player must not read or write progress for a preview.
 */
export async function getLessonDetail(
  slug: string,
  opts: { userId: string | null; preview: boolean },
): Promise<LessonDetailDTO | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { slug },
    include: {
      blocks: true,
      course: { select: { programId: true } },
      quiz: { include: { questions: { include: { options: true } } } },
    },
  });
  if (!lesson) return null;
  if (lesson.status !== "PUBLISHED" && !opts.preview) return null;

  const blocks = await toLessonBlockDTOs(lesson.blocks);

  let attemptsUsed = 0;
  let lastAttempt: LastQuizAttemptDTO | null = null;
  if (lesson.quiz && opts.userId && !opts.preview) {
    // Latest attempt of the CURRENT user only (own read-model, no history).
    const [count, latest] = await Promise.all([
      prisma.quizAttempt.count({ where: { userId: opts.userId, quizId: lesson.quiz.id } }),
      prisma.quizAttempt.findFirst({
        where: { userId: opts.userId, quizId: lesson.quiz.id },
        orderBy: { attemptNumber: "desc" },
        select: { attemptNumber: true, scorePercent: true, passed: true },
      }),
    ]);
    attemptsUsed = count;
    lastAttempt = latest;
  }
  const quiz = lesson.quiz ? toPublicQuizDTO(lesson.quiz, attemptsUsed, lastAttempt) : null;

  let progress: LessonDetailDTO["progress"] = { status: "NOT_STARTED", completedAt: null };
  let access: LessonDetailDTO["access"] = { locked: false, reason: null };
  let next: LessonDetailDTO["next"] = null;

  if (!opts.preview && opts.userId) {
    const [row, resolved] = await Promise.all([
      prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: opts.userId, lessonId: lesson.id } },
      }),
      resolveLessonAccess(opts.userId, lesson.id, lesson.course.programId),
    ]);
    if (row) progress = { status: row.status, completedAt: row.completedAt?.toISOString() ?? null };
    access = resolved.access;
    next = resolved.next;
  }

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    shortDescription: lesson.shortDescription,
    durationMinutes: lesson.durationMinutes,
    xpReward: lesson.xpReward,
    isRequired: lesson.isRequired,
    courseId: lesson.courseId,
    blocks,
    quiz,
    progress,
    access,
    next,
    preview: opts.preview,
  };
}
