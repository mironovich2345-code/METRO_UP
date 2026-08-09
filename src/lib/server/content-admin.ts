import "server-only";
import { z } from "zod";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { writeAudit } from "./audit";
import { uniqueLessonSlug } from "./content";
import { parseBlockData } from "./content-schemas";
import type {
  courseCreateSchema,
  courseUpdateSchema,
  dayCreateSchema,
  dayUpdateSchema,
  lessonCreateSchema,
  lessonUpdateSchema,
  programCreateSchema,
  programUpdateSchema,
  quizUpsertSchema,
  EditableBlockType,
} from "./content-schemas";

/**
 * Admin CMS mutations. Every mutation writes an audit record. A PUBLISHED lesson
 * is read-only for structural edits — the admin must unpublish (→ DRAFT) first,
 * so employees never see a half-edited published lesson (MVP safety model; see
 * docs/CONTENT_PLATFORM_DESIGN.md §Edit-published).
 */

type ProgramCreate = z.infer<typeof programCreateSchema>;
type ProgramUpdate = z.infer<typeof programUpdateSchema>;
type DayCreate = z.infer<typeof dayCreateSchema>;
type DayUpdate = z.infer<typeof dayUpdateSchema>;
type CourseCreate = z.infer<typeof courseCreateSchema>;
type CourseUpdate = z.infer<typeof courseUpdateSchema>;
type LessonCreate = z.infer<typeof lessonCreateSchema>;
type LessonUpdate = z.infer<typeof lessonUpdateSchema>;
type QuizUpsert = z.infer<typeof quizUpsertSchema>;

async function assertLessonEditable(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AuthError(404, "lesson_not_found");
  if (lesson.status === "PUBLISHED") {
    throw new AuthError(409, "lesson_published_readonly", "Сначала снимите урок с публикации");
  }
  return lesson;
}

/* ------------------------------- programs -------------------------------- */

export async function createProgram(actorUserId: string, input: ProgramCreate) {
  const max = await prisma.trainingProgram.aggregate({ _max: { order: true } });
  const program = await prisma.trainingProgram.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      order: (max._max.order ?? 0) + 1,
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "TrainingProgram", entityId: program.id, action: "CREATE" });
  return program;
}

export async function updateProgram(actorUserId: string, id: string, input: ProgramUpdate) {
  const program = await prisma.trainingProgram.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description,
      order: input.order,
      updatedById: actorUserId,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "TrainingProgram", entityId: id, action: "UPDATE" });
  return program;
}

export async function archiveProgram(actorUserId: string, id: string) {
  const program = await prisma.trainingProgram.update({ where: { id }, data: { status: "ARCHIVED" } });
  await writeAudit(prisma, { actorUserId, entityType: "TrainingProgram", entityId: id, action: "ARCHIVE" });
  return program;
}

/* --------------------------------- days ---------------------------------- */

export async function createDay(actorUserId: string, input: DayCreate) {
  const max = await prisma.trainingDay.aggregate({ where: { programId: input.programId }, _max: { order: true } });
  const day = await prisma.trainingDay.create({
    data: {
      programId: input.programId,
      title: input.title,
      description: input.description ?? null,
      dayNumber: input.dayNumber,
      order: input.order ?? (max._max.order ?? 0) + 1,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "TrainingDay", entityId: day.id, action: "CREATE" });
  return day;
}

export async function updateDay(actorUserId: string, id: string, input: DayUpdate) {
  const day = await prisma.trainingDay.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description === undefined ? undefined : input.description,
      dayNumber: input.dayNumber,
      order: input.order,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "TrainingDay", entityId: id, action: "UPDATE" });
  return day;
}

/* -------------------------------- courses -------------------------------- */

export async function createCourse(actorUserId: string, input: CourseCreate) {
  const max = await prisma.course.aggregate({ where: { programId: input.programId }, _max: { order: true } });
  const course = await prisma.course.create({
    data: {
      programId: input.programId,
      trainingDayId: input.trainingDayId ?? null,
      title: input.title,
      shortDescription: input.shortDescription ?? null,
      order: input.order ?? (max._max.order ?? 0) + 1,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Course", entityId: course.id, action: "CREATE" });
  return course;
}

export async function updateCourse(actorUserId: string, id: string, input: CourseUpdate) {
  const course = await prisma.course.update({
    where: { id },
    data: {
      title: input.title,
      shortDescription: input.shortDescription === undefined ? undefined : input.shortDescription,
      trainingDayId: input.trainingDayId === undefined ? undefined : input.trainingDayId,
      order: input.order,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Course", entityId: id, action: "UPDATE" });
  return course;
}

/* -------------------------------- lessons -------------------------------- */

export async function createLesson(actorUserId: string, input: LessonCreate) {
  const slug = input.slug ? await uniqueLessonSlug(input.slug) : await uniqueLessonSlug(input.title);
  const max = await prisma.lesson.aggregate({ where: { courseId: input.courseId }, _max: { order: true } });
  const lesson = await prisma.lesson.create({
    data: {
      courseId: input.courseId,
      title: input.title,
      slug,
      shortDescription: input.shortDescription ?? null,
      durationMinutes: input.durationMinutes ?? 0,
      xpReward: input.xpReward ?? 0,
      isRequired: input.isRequired ?? true,
      order: input.order ?? (max._max.order ?? 0) + 1,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Lesson", entityId: lesson.id, action: "CREATE" });
  return lesson;
}

export async function updateLesson(actorUserId: string, id: string, input: LessonUpdate) {
  await assertLessonEditable(id);
  const slug = input.slug ? await uniqueLessonSlug(input.slug, id) : undefined;
  const lesson = await prisma.lesson.update({
    where: { id },
    data: {
      title: input.title,
      slug,
      shortDescription: input.shortDescription === undefined ? undefined : input.shortDescription,
      durationMinutes: input.durationMinutes,
      xpReward: input.xpReward,
      isRequired: input.isRequired,
      order: input.order,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Lesson", entityId: id, action: "UPDATE" });
  return lesson;
}

/* -------------------------------- blocks --------------------------------- */

export async function createBlock(
  actorUserId: string,
  lessonId: string,
  type: EditableBlockType,
  data: unknown,
  order?: number,
) {
  await assertLessonEditable(lessonId);
  const parsed = parseBlockData(type, data); // throws ZodError on bad data
  const max = await prisma.lessonBlock.aggregate({ where: { lessonId }, _max: { order: true } });
  const block = await prisma.lessonBlock.create({
    data: {
      lessonId,
      type,
      data: parsed as object,
      order: order ?? (max._max.order ?? 0) + 1,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "LessonBlock", entityId: block.id, action: "CREATE" });
  return block;
}

export async function updateBlock(
  actorUserId: string,
  blockId: string,
  input: { data?: unknown; order?: number },
) {
  const block = await prisma.lessonBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new AuthError(404, "block_not_found");
  await assertLessonEditable(block.lessonId);
  const data = input.data !== undefined ? (parseBlockData(block.type as EditableBlockType, input.data) as object) : undefined;
  const updated = await prisma.lessonBlock.update({
    where: { id: blockId },
    data: { data, order: input.order },
  });
  await writeAudit(prisma, { actorUserId, entityType: "LessonBlock", entityId: blockId, action: "UPDATE" });
  return updated;
}

export async function deleteBlock(actorUserId: string, blockId: string) {
  const block = await prisma.lessonBlock.findUnique({ where: { id: blockId } });
  if (!block) throw new AuthError(404, "block_not_found");
  await assertLessonEditable(block.lessonId);
  await prisma.lessonBlock.delete({ where: { id: blockId } });
  await writeAudit(prisma, { actorUserId, entityType: "LessonBlock", entityId: blockId, action: "UPDATE" });
}

export async function reorderBlocks(actorUserId: string, lessonId: string, ids: string[]) {
  await assertLessonEditable(lessonId);
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.lessonBlock.update({ where: { id }, data: { order: i + 1 } }),
    ),
  );
  await writeAudit(prisma, { actorUserId, entityType: "Lesson", entityId: lessonId, action: "UPDATE" });
}

/* ---------------------------------- quiz --------------------------------- */

export async function upsertQuiz(actorUserId: string, lessonId: string, input: QuizUpsert) {
  await assertLessonEditable(lessonId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.quiz.findUnique({ where: { lessonId } });
    if (existing) {
      await tx.quizQuestion.deleteMany({ where: { quizId: existing.id } });
      await tx.quiz.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          description: input.description ?? null,
          passingPercent: input.passingPercent,
          maxAttempts: input.maxAttempts ?? null,
          xpReward: input.xpReward ?? 0,
        },
      });
    }
    const quiz =
      existing ??
      (await tx.quiz.create({
        data: {
          lessonId,
          title: input.title,
          description: input.description ?? null,
          passingPercent: input.passingPercent,
          maxAttempts: input.maxAttempts ?? null,
          xpReward: input.xpReward ?? 0,
        },
      }));
    for (const [qi, q] of input.questions.entries()) {
      await tx.quizQuestion.create({
        data: {
          quizId: quiz.id,
          text: q.text,
          type: q.type,
          explanation: q.explanation ?? null,
          order: q.order ?? qi + 1,
          options: {
            create: q.options.map((o, oi) => ({
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order ?? oi + 1,
            })),
          },
        },
      });
    }
    await writeAudit(tx, { actorUserId, entityType: "Quiz", entityId: quiz.id, action: "UPDATE" });
    return tx.quiz.findUnique({
      where: { id: quiz.id },
      include: { questions: { include: { options: true } } },
    });
  });
}

export async function deleteQuiz(actorUserId: string, lessonId: string) {
  await assertLessonEditable(lessonId);
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) return;
  await prisma.quiz.delete({ where: { id: quiz.id } });
  await writeAudit(prisma, { actorUserId, entityType: "Quiz", entityId: quiz.id, action: "UPDATE" });
}
