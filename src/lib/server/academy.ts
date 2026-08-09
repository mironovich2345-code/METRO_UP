import "server-only";
import { prisma } from "./db";
import { accessAt, getProgramSequence, getCompletedLessonIds } from "./gating";
import { getXpBalance } from "./progress";
import type { AcademyStateDTO, AcademyLessonStateDTO } from "@/lib/api/content-types";

/**
 * DB-backed Academy state: per-lesson status + lock, the next available lesson,
 * and XP total. Drives the employee Academy/Home once real content exists; the
 * UI keeps its legacy mock as a fallback when this returns no lessons.
 */
export async function getAcademyState(userId: string): Promise<AcademyStateDTO> {
  const programs = await prisma.trainingProgram.findMany({
    where: { status: "PUBLISHED", courses: { some: { lessons: { some: { status: "PUBLISHED" } } } } },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  const [completed, balance, progressRows] = await Promise.all([
    getCompletedLessonIds(userId),
    getXpBalance(userId),
    prisma.lessonProgress.findMany({ where: { userId }, select: { lessonId: true, status: true } }),
  ]);
  const statusByLesson = new Map(progressRows.map((r) => [r.lessonId, r.status]));

  const lessons: AcademyLessonStateDTO[] = [];
  let nextLesson: AcademyStateDTO["nextLesson"] = null;

  for (const program of programs) {
    const sequence = await getProgramSequence(program.id);
    sequence.forEach((l, i) => {
      const access = accessAt(sequence, i, completed);
      const isDone = completed.has(l.id);
      const status = isDone
        ? "COMPLETED"
        : statusByLesson.get(l.id) === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED";
      lessons.push({ lessonId: l.id, slug: l.slug, title: l.title, status, locked: access.locked });
      if (!nextLesson && !access.locked && !isDone) {
        nextLesson = { slug: l.slug, title: l.title };
      }
    });
  }

  return { lessons, nextLesson, xpTotal: balance.total };
}
