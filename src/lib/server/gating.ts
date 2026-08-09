import "server-only";
import { prisma } from "./db";
import { accessAt, type Access, type SequenceLesson } from "./gating-core";

/**
 * Server-side gating. Published lessons of a program form one ordered sequence
 * (day → course → lesson). A lesson unlocks only when every PRIOR REQUIRED
 * lesson is COMPLETED. Because a day's lessons precede the next day's in the
 * sequence, this also enforces "day N locked until day N-1 complete".
 *
 * Access is ALWAYS resolved on the server — never trusted from the client.
 * The pure decision logic lives in ./gating-core (unit-tested).
 */

export { accessAt };
export type { Access, SequenceLesson };

export async function getProgramSequence(programId: string): Promise<SequenceLesson[]> {
  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED", course: { programId } },
    include: { course: { include: { trainingDay: true } } },
  });
  return lessons
    .map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      isRequired: l.isRequired,
      dayNumber: l.course.trainingDay?.dayNumber ?? 9999,
      courseOrder: l.course.order,
      lessonOrder: l.order,
      durationMinutes: l.durationMinutes,
    }))
    .sort(
      (a, b) =>
        a.dayNumber - b.dayNumber ||
        a.courseOrder - b.courseOrder ||
        a.lessonOrder - b.lessonOrder,
    );
}

export async function getCompletedLessonIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.lessonProgress.findMany({
    where: { userId, status: "COMPLETED" },
    select: { lessonId: true },
  });
  return new Set(rows.map((r) => r.lessonId));
}

export interface ResolvedAccess {
  access: Access;
  next: { slug: string; title: string } | null;
  index: number;
  sequence: SequenceLesson[];
}

/** Resolve access + the next lesson in sequence for a given lesson. */
export async function resolveLessonAccess(
  userId: string,
  lessonId: string,
  programId: string,
): Promise<ResolvedAccess> {
  const [sequence, completed] = await Promise.all([
    getProgramSequence(programId),
    getCompletedLessonIds(userId),
  ]);
  const index = sequence.findIndex((l) => l.id === lessonId);
  const access = accessAt(sequence, index, completed);
  const nextLesson = index >= 0 ? sequence[index + 1] : undefined;
  return {
    access,
    next: nextLesson ? { slug: nextLesson.slug, title: nextLesson.title } : null,
    index,
    sequence,
  };
}

export async function programIdForLesson(lessonId: string): Promise<string | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { course: { select: { programId: true } } },
  });
  return lesson?.course.programId ?? null;
}
