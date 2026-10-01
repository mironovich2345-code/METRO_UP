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

/** Flatten Zod issues into a client-safe { field: message } map (no internals). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
