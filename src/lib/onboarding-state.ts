import type { AppUserDTO } from "@/lib/api/types";

/**
 * Server is the single source of truth for onboarding. Onboarding is considered
 * complete ONLY when the authenticated user has `onboardingCompleted` AND a
 * persisted EmployeeProfile. Neither localStorage state, a changed AppRole, nor
 * a cleared cache can force an already-onboarded user through onboarding again.
 * (Pure — no React/server-only import — so it is unit-testable.)
 */
export function serverOnboardingComplete(user: AppUserDTO | null | undefined): boolean {
  return Boolean(user && user.onboardingCompleted && user.profile);
}
