import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { writeAudit } from "./audit";
import { onKnowledgeChanged } from "./metric/knowledge-sync";
import { validateQuizStructure } from "./quiz";
import { isMeaningfulBlock } from "./content";
import { richDocHasText, type QuizUpsertInput, type RichDoc } from "./content-schemas";

/**
 * Publish validation + status transitions. A Lesson is published only when it
 * passes ALL checks — never partially. Errors are returned structured (safe,
 * no internals). Published content is archived, never hard-deleted.
 */

export interface PublishError {
  field: string;
  code: string;
  message: string;
}

export async function validateLessonForPublish(lessonId: string): Promise<PublishError[]> {
  const errors: PublishError[] = [];
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: true,
      blocks: true,
      quiz: { include: { questions: { include: { options: true } } } },
    },
  });
  if (!lesson) return [{ field: "lesson", code: "NOT_FOUND", message: "Урок не найден" }];

  if (!lesson.title || lesson.title.trim().length < 2)
    errors.push({ field: "title", code: "REQUIRED", message: "Укажите название" });
  if (!lesson.slug || !/^[a-z0-9-]+$/.test(lesson.slug))
    errors.push({ field: "slug", code: "INVALID", message: "Некорректный slug" });
  if (!lesson.course)
    errors.push({ field: "course", code: "REQUIRED", message: "Урок должен принадлежать курсу" });
  if (lesson.durationMinutes <= 0)
    errors.push({ field: "durationMinutes", code: "POSITIVE", message: "Длительность должна быть больше 0" });
  if (lesson.xpReward < 0)
    errors.push({ field: "xpReward", code: "NON_NEGATIVE", message: "XP не может быть отрицательным" });

  const meaningful = lesson.blocks.filter((b) => isMeaningfulBlock(b.type));
  if (meaningful.length === 0)
    errors.push({ field: "blocks", code: "EMPTY", message: "Добавьте хотя бы один содержательный блок" });

  // order sanity: block orders must be unique.
  const orders = lesson.blocks.map((b) => b.order);
  if (new Set(orders).size !== orders.length)
    errors.push({ field: "blocks", code: "ORDER", message: "Порядок блоков некорректен" });

  // Every VIDEO block must reference a READY MediaAsset.
  const videoBlocks = lesson.blocks.filter((b) => b.type === "VIDEO");
  const videoIds = videoBlocks
    .map((b) => (b.data as { mediaAssetId?: string } | null)?.mediaAssetId)
    .filter((x): x is string => typeof x === "string");
  const assets = videoIds.length
    ? await prisma.mediaAsset.findMany({ where: { id: { in: videoIds } } })
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const b of videoBlocks) {
    const id = (b.data as { mediaAssetId?: string } | null)?.mediaAssetId;
    if (!id) {
      errors.push({ field: "video", code: "MEDIA_REQUIRED", message: "Видео-блок без загруженного видео" });
      continue;
    }
    const a = byId.get(id);
    if (!a || a.status !== "READY")
      errors.push({ field: "video", code: "MEDIA_NOT_READY", message: "Видео ещё не готово (media не READY)" });
  }

  // New content blocks: if present, they must not be empty (§9).
  for (const b of lesson.blocks) {
    if (b.type === "COLLAPSIBLE_TEXT") {
      const doc = ((b.data as { content?: RichDoc } | null)?.content ?? []) as RichDoc;
      if (!richDocHasText(doc))
        errors.push({ field: "collapsible_text", code: "EMPTY_CONTENT", message: "Текстовая версия не может быть пустой" });
    }
    if (b.type === "KEY_TAKEAWAYS") {
      const items = ((b.data as { items?: Array<{ title?: string; text?: string }> } | null)?.items ?? []);
      const ok = items.some((it) => (it.title ?? "").trim() && (it.text ?? "").trim());
      if (!ok) errors.push({ field: "key_takeaways", code: "EMPTY", message: "Добавьте хотя бы одну заполненную карточку" });
    }
  }

  // Quiz (if present) must be structurally valid.
  if (lesson.quiz) {
    const asInput: QuizUpsertInput = {
      title: lesson.quiz.title,
      description: lesson.quiz.description,
      passingPercent: lesson.quiz.passingPercent,
      maxAttempts: lesson.quiz.maxAttempts,
      xpReward: lesson.quiz.xpReward,
      questions: lesson.quiz.questions.map((q) => ({
        text: q.text,
        type: q.type,
        explanation: q.explanation,
        order: q.order,
        options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })),
      })),
    };
    for (const qe of validateQuizStructure(asInput)) {
      errors.push({ field: "quiz", code: qe.code, message: qe.message });
    }
  }

  return errors;
}

export interface PublishWarning {
  code: string;
  message: string;
}

/**
 * Non-blocking publish warnings (best-practice nudges, never block publishing so
 * short video-only lessons stay valid): missing text version / missing takeaways.
 */
export async function getLessonPublishWarnings(lessonId: string): Promise<PublishWarning[]> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { blocks: { select: { type: true } } },
  });
  if (!lesson) return [];
  const types = new Set(lesson.blocks.map((b) => b.type));
  const warnings: PublishWarning[] = [];
  if (types.has("VIDEO") && !types.has("COLLAPSIBLE_TEXT"))
    warnings.push({ code: "NO_TEXT", message: "У урока нет текстовой версии." });
  if (!types.has("KEY_TAKEAWAYS"))
    warnings.push({ code: "NO_TAKEAWAYS", message: "Не добавлены ключевые выводы." });
  return warnings;
}

export async function publishLesson(actorUserId: string, lessonId: string) {
  const errors = await validateLessonForPublish(lessonId);
  if (errors.length) throw new AuthError(400, "publish_validation_failed", "publish_validation_failed", errors);

  const lesson = await prisma.$transaction(async (tx) => {
    const updated = await tx.lesson.update({
      where: { id: lessonId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    // Publishing a lesson also publishes its quiz so it is servable.
    await tx.quiz.updateMany({ where: { lessonId }, data: { status: "PUBLISHED" } });
    await writeAudit(tx, {
      actorUserId, entityType: "Lesson", entityId: lessonId, action: "PUBLISH",
    });
    return updated;
  });
  onKnowledgeChanged("ACADEMY", lessonId);
  return lesson;
}

export async function setLessonStatus(
  actorUserId: string,
  lessonId: string,
  status: "DRAFT" | "ARCHIVED",
) {
  const action = status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH";
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.lesson.update({ where: { id: lessonId }, data: { status } });
    await writeAudit(tx, { actorUserId, entityType: "Lesson", entityId: lessonId, action });
    return row;
  });
  onKnowledgeChanged("ACADEMY", lessonId);
  return updated;
}
