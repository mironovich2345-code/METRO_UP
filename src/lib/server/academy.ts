import "server-only";
import { prisma } from "./db";
import { accessAt, getProgramSequence, getCompletedLessonIds } from "./gating";
import { getXpBalance } from "./progress";
import type {
  AcademyStateDTO,
  AcademyLessonStateDTO,
  AcademyOverviewDTO,
  AcademyDayDetailDTO,
} from "@/lib/api/content-types";

/**
 * DB-backed Academy. PostgreSQL/CMS is the source of truth — only PUBLISHED
 * lessons are ever exposed, gating/progress are resolved server-side, and no
 * mock lesson data is used. Visibility keys on the LESSON status, so publishing
 * a lesson makes it appear even if its program/day are still DRAFT.
 */

/** Program ids that currently have at least one PUBLISHED lesson. */
async function programIdsWithPublishedLessons(): Promise<string[]> {
  const rows = await prisma.lesson.findMany({
    where: { status: "PUBLISHED" },
    select: { course: { select: { programId: true } } },
  });
  return [...new Set(rows.map((r) => r.course.programId))];
}

/** Flat per-lesson state + next lesson + XP (used by Home "continue" card). */
export async function getAcademyState(userId: string): Promise<AcademyStateDTO> {
  const programIds = await programIdsWithPublishedLessons();
  const [completed, balance, progressRows] = await Promise.all([
    getCompletedLessonIds(userId),
    getXpBalance(userId),
    prisma.lessonProgress.findMany({ where: { userId }, select: { lessonId: true, status: true } }),
  ]);
  const statusByLesson = new Map(progressRows.map((r) => [r.lessonId, r.status]));

  const lessons: AcademyLessonStateDTO[] = [];
  let nextLesson: AcademyStateDTO["nextLesson"] = null;

  for (const programId of programIds) {
    const sequence = await getProgramSequence(programId);
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

/**
 * Structured Academy overview: Program → Day cards with published-lesson counts,
 * completion, duration, and lock state. Overall progress counts only PUBLISHED
 * REQUIRED lessons.
 */
export async function getAcademyOverview(userId: string): Promise<AcademyOverviewDTO> {
  const programIds = await programIdsWithPublishedLessons();
  const balance = await getXpBalance(userId);

  if (programIds.length === 0) {
    const anyProgram = await prisma.trainingProgram.findFirst({ select: { id: true } });
    return {
      hasContent: false,
      programExists: Boolean(anyProgram),
      programs: [],
      overall: { completed: 0, total: 0, ratio: 0 },
      nextLesson: null,
      xpTotal: balance.total,
    };
  }

  const [programs, completed] = await Promise.all([
    prisma.trainingProgram.findMany({
      where: { id: { in: programIds } },
      orderBy: { order: "asc" },
      include: { days: { orderBy: { dayNumber: "asc" } } },
    }),
    getCompletedLessonIds(userId),
  ]);

  let overallTotal = 0;
  let overallCompleted = 0;
  let nextLesson: AcademyOverviewDTO["nextLesson"] = null;
  const outPrograms: AcademyOverviewDTO["programs"] = [];

  for (const program of programs) {
    const sequence = await getProgramSequence(program.id);

    // overall required-lesson progress
    for (const l of sequence) {
      if (l.isRequired) {
        overallTotal += 1;
        if (completed.has(l.id)) overallCompleted += 1;
      }
    }
    // next available, not-completed lesson
    if (!nextLesson) {
      for (let i = 0; i < sequence.length; i++) {
        const l = sequence[i];
        if (!accessAt(sequence, i, completed).locked && !completed.has(l.id)) {
          nextLesson = { slug: l.slug, title: l.title };
          break;
        }
      }
    }

    const dayCard = (
      id: string,
      title: string,
      dayNumber: number,
      dayLessons: typeof sequence,
      locked: boolean,
      virtual: boolean,
    ) => {
      const completedLessons = dayLessons.filter((l) => completed.has(l.id)).length;
      const durationMinutes = dayLessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
      return {
        id,
        title,
        dayNumber,
        totalLessons: dayLessons.length,
        completedLessons,
        progressPercent: dayLessons.length
          ? Math.round((completedLessons / dayLessons.length) * 100)
          : 0,
        durationMinutes,
        locked,
        virtual,
      };
    };

    // Real training days: match lessons by trainingDayId. A day unlocks only when
    // every REQUIRED lesson in a PRIOR day is done.
    const days = program.days.map((day) => {
      const dayLessons = sequence.filter((l) => l.trainingDayId === day.id);
      const locked = sequence.some(
        (l) => l.dayNumber < day.dayNumber && l.isRequired && !completed.has(l.id),
      );
      return dayCard(day.id, day.title, day.dayNumber, dayLessons, locked, false);
    });

    // Published lessons whose course has NO TrainingDay must still be reachable
    // (never hide published content). Surface them in a synthetic "Уроки" day.
    const looseLessons = sequence.filter((l) => !l.trainingDayId);
    if (looseLessons.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[academy] program ${program.id} has ${looseLessons.length} published lesson(s) with no TrainingDay (course.trainingDayId=null). Shown under a virtual day. Attach the course to a day in the CMS.`,
        );
      }
      const firstIdx = sequence.findIndex((l) => !l.trainingDayId);
      const locked = firstIdx >= 0 ? accessAt(sequence, firstIdx, completed).locked : false;
      const maxDayNumber = program.days.reduce((m, d) => Math.max(m, d.dayNumber), 0);
      days.push(dayCard(`nodays:${program.id}`, "Уроки", maxDayNumber + 1, looseLessons, locked, true));
    }

    outPrograms.push({ id: program.id, title: program.title, days });
  }

  return {
    hasContent: true,
    programExists: true,
    programs: outPrograms,
    overall: {
      completed: overallCompleted,
      total: overallTotal,
      ratio: overallTotal ? overallCompleted / overallTotal : 0,
    },
    nextLesson,
    xpTotal: balance.total,
  };
}

/** One training day with its courses + PUBLISHED lessons, gated for the user. */
export async function getAcademyDayDetail(
  userId: string,
  dayId: string,
): Promise<AcademyDayDetailDTO | null> {
  // Virtual "Уроки" bucket: courses of a program that have no TrainingDay.
  if (dayId.startsWith("nodays:")) {
    return getVirtualDayDetail(userId, dayId.slice("nodays:".length));
  }

  const day = await prisma.trainingDay.findUnique({
    where: { id: dayId },
    include: {
      program: { select: { title: true } },
      courses: {
        where: { trainingDayId: dayId },
        orderBy: { order: "asc" },
        include: {
          lessons: { where: { status: "PUBLISHED" }, orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!day) return null;

  const [sequence, completed] = await Promise.all([
    getProgramSequence(day.programId),
    getCompletedLessonIds(userId),
  ]);
  const indexById = new Map(sequence.map((l, i) => [l.id, i]));

  const courses = day.courses
    .map((c) => ({
      id: c.id,
      title: c.title,
      shortDescription: c.shortDescription,
      lessons: c.lessons.map((l) => {
        const i = indexById.get(l.id);
        const locked = i == null ? true : accessAt(sequence, i, completed).locked;
        return {
          id: l.id,
          slug: l.slug,
          title: l.title,
          shortDescription: l.shortDescription,
          durationMinutes: l.durationMinutes,
          xpReward: l.xpReward,
          isRequired: l.isRequired,
          completed: completed.has(l.id),
          locked,
        };
      }),
    }))
    .filter((c) => c.lessons.length > 0);

  return {
    id: day.id,
    title: day.title,
    description: day.description,
    dayNumber: day.dayNumber,
    programTitle: day.program.title,
    courses,
  };
}

/** Detail for the synthetic "Уроки" day — a program's courses without a TrainingDay. */
async function getVirtualDayDetail(
  userId: string,
  programId: string,
): Promise<AcademyDayDetailDTO | null> {
  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    select: { title: true },
  });
  if (!program) return null;

  const [dbCourses, sequence, completed] = await Promise.all([
    prisma.course.findMany({
      where: { programId, trainingDayId: null },
      orderBy: { order: "asc" },
      include: { lessons: { where: { status: "PUBLISHED" }, orderBy: { order: "asc" } } },
    }),
    getProgramSequence(programId),
    getCompletedLessonIds(userId),
  ]);
  const indexById = new Map(sequence.map((l, i) => [l.id, i]));

  const courses = dbCourses
    .map((c) => ({
      id: c.id,
      title: c.title,
      shortDescription: c.shortDescription,
      lessons: c.lessons.map((l) => {
        const i = indexById.get(l.id);
        const locked = i == null ? true : accessAt(sequence, i, completed).locked;
        return {
          id: l.id,
          slug: l.slug,
          title: l.title,
          shortDescription: l.shortDescription,
          durationMinutes: l.durationMinutes,
          xpReward: l.xpReward,
          isRequired: l.isRequired,
          completed: completed.has(l.id),
          locked,
        };
      }),
    }))
    .filter((c) => c.lessons.length > 0);

  return {
    id: `nodays:${programId}`,
    title: "Уроки",
    description: null,
    dayNumber: 0,
    programTitle: program.title,
    courses,
  };
}
