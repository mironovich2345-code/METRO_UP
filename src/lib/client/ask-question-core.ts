import type { CreateQuestionRequestDTO, QuestionCategoryDTO, QuestionSenderContextDTO } from "@/lib/api/questions-types";
import type { StoredHomeContext } from "@/lib/home-context-storage";

/**
 * METRO UP ROUND 1, Milestone 2B — Ask Question screen. Pure (no DOM/fetch)
 * state/validation logic, pulled out for direct unit test coverage —
 * exactly this codebase's established split between pure decision logic and
 * the component that renders it (see every other `-core.ts` module).
 *
 * MIME/size limits here are a small, deliberate CLIENT-SIDE COPY of
 * storage/validation.ts's QUESTION_ATTACHMENT rule, not an import of that
 * module — storage/validation.ts transitively imports storage/types.ts,
 * which has a top-level `"server-only"` marker, so importing it into client
 * code would throw at module evaluation. Keep these four constants in sync
 * with QUESTION_ATTACHMENT if that rule ever changes.
 */

export const QUESTION_CATEGORY_OPTIONS: { value: QuestionCategoryDTO; label: string }[] = [
  { value: "WORK_PROCESSES", label: "Работа и процессы" },
  { value: "TRAINING", label: "Обучение" },
  { value: "MANAGEMENT", label: "Руководитель" },
  { value: "WORKING_CONDITIONS", label: "Условия работы" },
  { value: "TECHNICAL", label: "Техническая проблема" },
  { value: "IDEA", label: "Идея / предложение" },
  { value: "OTHER", label: "Другое" },
];

export const QUESTION_TEXT_MAX_LENGTH = 4000; // mirrors createQuestionSchema's z.string().max(4000)
export const MAX_QUESTION_ATTACHMENTS = 5; // mirrors questions-core.ts's MAX_QUESTION_ATTACHMENTS
export const QUESTION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // mirrors MEDIA_RULES.QUESTION_ATTACHMENT.maxBytes
export const QUESTION_ATTACHMENT_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type AttachmentUploadStatus = "uploading" | "done" | "error";

export interface AttachmentDraft {
  localId: string;
  file: File;
  status: AttachmentUploadStatus;
  storageKey: string | null;
  errorMessage: string | null;
}

/** Non-empty, non-whitespace-only, within the server's own limit. */
export function validateQuestionText(text: string): { ok: true } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Введите текст вопроса" };
  if (trimmed.length > QUESTION_TEXT_MAX_LENGTH) return { ok: false, message: `Текст вопроса слишком длинный (максимум ${QUESTION_TEXT_MAX_LENGTH} символов)` };
  return { ok: true };
}

/** Section 5 — client-side mirror of the server's QUESTION_ATTACHMENT rule.
 * Never the sole gate (the server independently re-validates the REAL
 * uploaded mime/size via storage.headObject) — this exists purely so a bad
 * file is rejected before spending an upload round trip on it. */
export function validateAttachmentFile(file: { type: string; size: number }): { ok: true } | { ok: false; message: string } {
  if (!(QUESTION_ATTACHMENT_ALLOWED_MIMES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Недопустимый тип файла. Разрешены JPG, PNG, WEBP и PDF." };
  }
  if (file.size > QUESTION_ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: "Файл превышает 10 МБ." };
  }
  if (file.size <= 0) {
    return { ok: false, message: "Некорректный файл." };
  }
  return { ok: true };
}

/** Section 5 — at most MAX_QUESTION_ATTACHMENTS total; how many more may be
 * added given the current draft list. */
export function remainingAttachmentSlots(current: { localId: string }[]): number {
  return Math.max(0, MAX_QUESTION_ATTACHMENTS - current.length);
}

/**
 * Section 7 — "use the active validated Mini App context", never a
 * role-picker on the form itself: the sender context is whatever Home's own
 * context switcher last confirmed with the server (home-context-storage.ts
 * — a display hint, never authority; the server independently re-validates
 * via canSendQuestionAs regardless of what this resolves to). "PERSONAL"
 * (Home's name for the plain-employee context) maps to this domain's
 * "MANAGER" — the same mapping cabinet-ui.ts's homeContextToAcademySection
 * already applies for Academy, reimplemented locally rather than imported
 * across an unrelated domain boundary for a one-line mapping.
 */
export function resolveSenderContext(stored: StoredHomeContext | null): QuestionSenderContextDTO {
  if (!stored) return "MANAGER";
  return stored.type === "PERSONAL" ? "MANAGER" : stored.type;
}

/**
 * Section 7 — the exact, minimal request shape. No userId/cityId/clubId
 * field exists on this return type at all (CreateQuestionRequestDTO has no
 * such fields) — the server derives scope entirely from the session
 * (questions-service.ts). Only successfully uploaded attachments
 * (status "done", storageKey present) are ever included.
 */
export function buildCreateQuestionPayload(input: {
  senderContext: QuestionSenderContextDTO;
  category: QuestionCategoryDTO;
  text: string;
  anonymous: boolean;
  attachments: AttachmentDraft[];
}): CreateQuestionRequestDTO {
  return {
    senderContext: input.senderContext,
    category: input.category,
    text: input.text.trim(),
    anonymous: input.anonymous,
    attachments: input.attachments
      .filter((a) => a.status === "done" && a.storageKey)
      .map((a) => ({ storageKey: a.storageKey!, originalName: a.file.name })),
  };
}

/**
 * Section 6 — double-submit prevention + "do not silently submit an
 * incomplete question": submit is disabled while already submitting, while
 * the text is invalid, or while ANY attachment is still uploading or in an
 * error state (the user must wait, remove, or retry first).
 */
export function isSubmitDisabled(state: { submitting: boolean; text: string; attachments: AttachmentDraft[] }): boolean {
  if (state.submitting) return true;
  if (!validateQuestionText(state.text).ok) return true;
  return state.attachments.some((a) => a.status === "uploading" || a.status === "error");
}
