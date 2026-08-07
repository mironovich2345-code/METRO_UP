import "server-only";
import { z } from "zod";

/**
 * Server-only environment validation. Secrets are read lazily (never at build
 * time) and NEVER exposed to the client. Do not log these values.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  /** Opt-in dev flag to allow demo auth; never honoured in production. */
  ALLOW_DEMO_AUTH: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Validate and return server env (cached). Throws a redacted error if invalid. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report which keys are invalid — never their values.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Demo authentication is allowed only outside production, and only when
 * explicitly enabled. There is never a demo backdoor in production.
 */
export function isDemoAuthAllowed(): boolean {
  if (isProduction()) return false;
  return process.env.ALLOW_DEMO_AUTH === "1";
}
