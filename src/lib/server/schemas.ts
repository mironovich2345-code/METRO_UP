import { z } from "zod";

/**
 * Request validation schemas. Unknown keys are stripped by default, so a client
 * can never inject privileged fields (role, accessStatus, careerLevel,
 * onboardingCompleted) — the server sets those itself.
 */

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});
export type TelegramAuthInput = z.infer<typeof telegramAuthSchema>;

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Имя должно содержать минимум 2 символа")
    .max(50, "Имя не может быть длиннее 50 символов"),
  cityId: z.string().min(1, "Выберите город"),
  clubId: z.string().min(1, "Выберите клуб"),
  positionId: z.enum(["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"], {
    message: "Выберите должность",
  }),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** METRO UP ROUND 1, Milestone 1 — avatar upload. MIME/size are re-validated
 * for real against MEDIA_RULES.AVATAR server-side (storage/validation.ts) —
 * this schema only guards against a malformed/missing request shape. */
export const avatarUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive(),
});
export type AvatarUploadRequestInput = z.infer<typeof avatarUploadRequestSchema>;

export const avatarCompleteSchema = z.object({
  storageKey: z.string().min(1).max(500),
});
export type AvatarCompleteInput = z.infer<typeof avatarCompleteSchema>;

/** METRO UP ROUND 1, Milestone 2A — employee questions. category/senderContext
 * are closed enums (z.enum), never free text — matches section 1's "typed,
 * not free text" requirement at the request-validation boundary too, on top
 * of the Prisma enum itself. city/club/author fields are deliberately absent
 * from this schema — the server always derives them (section 5), a client
 * can't even SHAPE a request that claims them. */
export const createQuestionSchema = z.object({
  senderContext: z.enum(["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]),
  category: z.enum(["WORK_PROCESSES", "TRAINING", "MANAGEMENT", "WORKING_CONDITIONS", "TECHNICAL", "IDEA", "OTHER"]),
  text: z.string().trim().min(1, "Введите текст вопроса").max(4000, "Текст вопроса слишком длинный"),
  anonymous: z.boolean(),
  attachments: z
    .array(
      z.object({
        storageKey: z.string().min(1).max(500),
        originalName: z.string().min(1).max(300),
      }),
    )
    .max(5, "Максимум 5 вложений"),
  // METRO UP ROUND 1, Milestone 2B.1, section B — an OPTIONAL selector among
  // the actor's OWN real grants (questions-core.ts's resolveScopeFromCandidates)
  // — never trusted as a raw cityId/clubId by itself; a forged value matches
  // no candidate and is rejected, never silently accepted.
  scopeHint: z.object({ cityId: z.string().min(1).max(200).optional(), clubId: z.string().min(1).max(200).optional() }).optional(),
});
export type CreateQuestionSchemaInput = z.infer<typeof createQuestionSchema>;

export const questionAttachmentUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int().positive(),
});
export type QuestionAttachmentUploadRequestInput = z.infer<typeof questionAttachmentUploadRequestSchema>;

/** Flatten Zod issues into a client-safe { field: message } map (no internals). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
