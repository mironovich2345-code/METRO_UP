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

/** Flatten Zod issues into a client-safe { field: message } map (no internals). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
