import "server-only";
import { prisma } from "./db";
import { accessAt, getProgramSequence, getCompletedLessonIds } from "./gating";
import { getXpBalance } from "./progress";
import { getPositionById } from "@/content/positions";
import { cachedForMs } from "./ttl-cache";
import type {
  AcademyStateDTO,
  AcademyLessonStateDTO,
  AcademyOverviewDTO,
  AcademyDayDetailDTO,
  AcademyTargetRoleDTO,
  EmployeeTrainingDetailDTO,
} from "@/lib/api/content-types";

/**
 * DB-backed Academy. PostgreSQL/CMS is the source of truth — only PUBLISHED
 * lessons are ever exposed, gating/progress are resolved server-side, and no
 * mock lesson data is used. Visibility keys on the LESSON status, so publishing
 * a lesson makes it appear even if its program/day are still DRAFT.
 */

/**
 * Program ids that currently have at least one PUBLISHED lesson.
 *
 * Sprint: mini-app-performance, section 9 — TTL-cached (60s), NOT
 * invalidation-based: this result is identical for every user (no scope
 * param at all — see ttl-cache.ts's own security doc), and the write
 * surface that could change it (lesson publish/status/edit, ~10 separate
 * admin CMS routes) is small-frequency, deliberate, admin-only actions —
 * a bounded staleness window here is a simpler, safer tradeoff than hand-
 * wiring invalidation across every one of those routes.
 */
async function programIdsWithPublishedLessons(): Promise<string[]> {
  return cachedForMs("academy:published-program-ids", 60_000, async () => {
    const rows = await prisma.lesson.findMany({
      where: { status: "PUBLISHED" },
      select: { course: { select: { programId: true } } },
    });
    return [...new Set(rows.map((r) => r.course.programId))];
  });
}

/**
 * Sprint: mini-app-role-experience, section 3 — "the smallest explicit
 * onboarding-course restriction without designing the full Audience system".
 * Academy Audience (per-position/city/club required courses) does not exist
 * yet, so there is no real concept of "the onboarding course" in the data
 * model. The one thing that IS already true and meaningful: TrainingProgram
 * has an explicit `order`, and programs are always presented in that order
 * everywhere else in Academy (getAcademyOverview sorts by it). The FIRST
 * program (by order) that has at least one PUBLISHED lesson is therefore the
 * one every new employee would naturally reach first — that is what
 * PENDING_APPROVAL is scoped to. Nothing here decides per-position/per-city
 * content; that is deliberately left to a future Academy Audience feature.
 */
export async function resolveOnboardingProgramId(): Promise<string | null> {
  const programIds = await programIdsWithPublishedLessons();
  if (programIds.length === 0) return null;
  const first = await prisma.trainingProgram.findFirst({
    where: { id: { in: programIds } },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/**
 * Does `accessStatus` restrict Academy content, and if so, is `target`
 * inside the allowed scope? PENDING_APPROVAL is scoped to the single
 * onboarding program (resolveOnboardingProgramId), same as before — checked
 * first and unconditionally, since onboarding has no role-section concept.
 *
 * Sprint: manual-test-round-2, section 4 — for LIMITED/FULL, when
 * `allowedSections` is supplied, `target`'s own program must belong to one
 * of the actor's real allowed Academy sections (resolveAllowedAcademySections)
 * — the same enforcement isAcademyContentAllowed already did for
 * PENDING_APPROVAL, extended so a direct day/lesson link outside every
 * section a user actually holds still 404s, never merely client-hidden.
 * `allowedSections` omitted (existing callers, e.g. CMS preview) keeps the
 * pre-existing "LIMITED/FULL see everything" behavior unchanged.
 */
export async function isAcademyContentAllowed(
  accessStatus: "LIMITED" | "PENDING_APPROVAL" | "FULL" | "SUSPENDED",
  target: { lessonProgramId: string | null } | { dayProgramId: string | null },
  allowedSections?: AcademyTargetRoleDTO[],
): Promise<boolean> {
  const programId = "lessonProgramId" in target ? target.lessonProgramId : target.dayProgramId;

  if (accessStatus === "PENDING_APPROVAL") {
    const onboardingProgramId = await resolveOnboardingProgramId();
    if (!onboardingProgramId) return false;
    return programId === onboardingProgramId;
  }

  if (allowedSections) {
    if (!programId) return false;
    const program = await prisma.trainingProgram.findUnique({ where: { id: programId }, select: { targetRole: true } });
    if (!program) return false;
    return (allowedSections as string[]).includes(program.targetRole);
  }

  return true;
}

/**
 * Section 4 — the program ids visible under ONE Academy tab/section. Never a
 * union across sections (CITY_MANAGER's "Ст. города" tab shows ONLY
 * CITY_MANAGER-targeted programs, not CLUB_MANAGER/MANAGER's too — those are
 * their own separate tabs the same actor can also open). Intersected with
 * programIdsWithPublishedLessons so an empty/all-DRAFT program in the right
 * section still correctly shows as "no content" rather than an empty tile.
 */
export async function resolveAcademyProgramIdsForSection(section: AcademyTargetRoleDTO): Promise<string[]> {
  const publishedProgramIds = await programIdsWithPublishedLessons();
  if (publishedProgramIds.length === 0) return [];
  const rows = await prisma.trainingProgram.findMany({
    where: { id: { in: publishedProgramIds }, targetRole: section },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Resolve a TrainingDay id (or the synthetic "nodays:<programId>" bucket
 * id) to its owning program id, for isAcademyContentAllowed's dayProgramId
 * target. Returns null when the day doesn't exist. */
export async function resolveDayProgramId(dayId: string): Promise<string | null> {
  if (dayId.startsWith("nodays:")) return dayId.slice("nodays:".length);
  const day = await prisma.trainingDay.findUnique({ where: { id: dayId }, select: { programId: true } });
  return day?.programId ?? null;
}

/**
 * Flat per-lesson state + next lesson + XP (used by Home "continue" card).
 * `restrictToProgramIds` — when provided, only these programs are included
 * (PENDING_APPROVAL's onboarding-only scope, section 3); omitted for
 * LIMITED/FULL, which see everything, unchanged from before this restriction
 * existed.
 */
export async function getAcademyState(userId: string, restrictToProgramIds?: string[]): Promise<AcademyStateDTO> {
  const allProgramIds = await programIdsWithPublishedLessons();
  const programIds = restrictToProgramIds ? allProgramIds.filter((id) => restrictToProgramIds.includes(id)) : allProgramIds;
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
 * REQUIRED lessons. `restrictToProgramIds` — see getAcademyState's doc comment;
 * same PENDING_APPROVAL onboarding-only scope, same "omitted means everyone
 * else sees everything, unchanged" contract.
 */
export async function getAcademyOverview(userId: string, restrictToProgramIds?: string[]): Promise<AcademyOverviewDTO> {
  const allProgramIds = await programIdsWithPublishedLessons();
  const programIds = restrictToProgramIds ? allProgramIds.filter((id) => restrictToProgramIds.includes(id)) : allProgramIds;
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

/**
 * Sprint: manual-test-round-3, section 5C — a manager's (CITY_MANAGER or
 * CLUB_MANAGER, via the shared /api/control/cabinet/employee-training route
 * — never duplicated per role, section 5D) detailed view of ONE employee's
 * training. Reuses the exact same primitives getAcademyOverview already
 * uses (programIdsWithPublishedLessons, getProgramSequence,
 * getCompletedLessonIds) rather than a parallel query path, extended with
 * per-lesson completedAt + the latest QuizAttempt per lesson (schema audit:
 * LessonProgress/QuizAttempt genuinely support this; no due date/mandatory/
 * overdue/time-spent concept exists anywhere, so none is fabricated here).
 *
 * Query strategy — bounded, no N+1: one query for published program ids,
 * one for the programs themselves, one getProgramSequence call PER PROGRAM
 * (same pattern getAcademyOverview already uses — programs are few), then
 * exactly ONE batched query each for this employee's LessonProgress rows,
 * this employee's Quiz rows (across every lesson in scope), and this
 * employee's QuizAttempt rows — never per-lesson, never per-day.
 */
export async function getEmployeeTrainingDetail(employeeUserId: string): Promise<EmployeeTrainingDetailDTO> {
  const [user, programIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: employeeUserId },
      select: { displayName: true, employeeProfile: { select: { positionId: true } } },
    }),
    programIdsWithPublishedLessons(),
  ]);

  const displayName = user?.displayName ?? "—";
  const position = user?.employeeProfile ? getPositionById(user.employeeProfile.positionId)?.title ?? null : null;

  if (programIds.length === 0) {
    return { displayName, position, programs: [], overall: { completed: 0, total: 0 } };
  }

  const [programs, completedIds] = await Promise.all([
    prisma.trainingProgram.findMany({ where: { id: { in: programIds } }, orderBy: { order: "asc" }, select: { id: true, title: true } }),
    getCompletedLessonIds(employeeUserId),
  ]);

  const sequencesByProgram = new Map<string, Awaited<ReturnType<typeof getProgramSequence>>>();
  const allLessonIds: string[] = [];
  for (const program of programs) {
    const sequence = await getProgramSequence(program.id);
    sequencesByProgram.set(program.id, sequence);
    for (const l of sequence) allLessonIds.push(l.id);
  }

  const [progressRows, quizzes] = await Promise.all([
    prisma.lessonProgress.findMany({
      where: { userId: employeeUserId, lessonId: { in: allLessonIds } },
      select: { lessonId: true, completedAt: true },
    }),
    allLessonIds.length
      ? prisma.quiz.findMany({ where: { lessonId: { in: allLessonIds } }, select: { id: true, lessonId: true } })
      : Promise.resolve([]),
  ]);
  const completedAtByLesson = new Map(progressRows.filter((r) => r.completedAt).map((r) => [r.lessonId, r.completedAt!.toISOString()]));
  const quizIdToLessonId = new Map(quizzes.map((q) => [q.id, q.lessonId]));

  const attempts = quizzes.length
    ? await prisma.quizAttempt.findMany({
        where: { userId: employeeUserId, quizId: { in: quizzes.map((q) => q.id) } },
        orderBy: { attemptNumber: "desc" },
        select: { quizId: true, scorePercent: true, passed: true },
      })
    : [];
  const latestQuizByLesson = new Map<string, { scorePercent: number; passed: boolean }>();
  for (const a of attempts) {
    const lessonId = quizIdToLessonId.get(a.quizId);
    if (!lessonId || latestQuizByLesson.has(lessonId)) continue; // already-seen = a later attempt (desc order)
    latestQuizByLesson.set(lessonId, { scorePercent: a.scorePercent, passed: a.passed });
  }

  let overallCompleted = 0;
  let overallTotal = 0;
  const outPrograms: EmployeeTrainingDetailDTO["programs"] = [];
  for (const program of programs) {
    const sequence = sequencesByProgram.get(program.id) ?? [];
    if (sequence.length === 0) continue;
    let programCompleted = 0;
    const lessons: EmployeeTrainingDetailDTO["programs"][number]["lessons"] = sequence.map((l) => {
      const completed = completedIds.has(l.id);
      if (completed) programCompleted += 1;
      return {
        id: l.id,
        slug: l.slug,
        title: l.title,
        dayNumber: l.dayNumber,
        isRequired: l.isRequired,
        durationMinutes: l.durationMinutes ?? 0,
        completed,
        completedAt: completedAtByLesson.get(l.id) ?? null,
        quiz: latestQuizByLesson.get(l.id) ?? null,
      };
    });
    overallCompleted += programCompleted;
    overallTotal += sequence.length;
    outPrograms.push({ id: program.id, title: program.title, completedLessons: programCompleted, totalLessons: sequence.length, lessons });
  }

  return { displayName, position, programs: outPrograms, overall: { completed: overallCompleted, total: overallTotal } };
}
