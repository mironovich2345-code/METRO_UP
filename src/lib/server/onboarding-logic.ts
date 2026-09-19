/**
 * Pure onboarding guard predicate (no DB / server-only import, so it is
 * directly unit-testable). The service composes this with the session-derived
 * profile; the server remains the sole authority — never a client-sent flag.
 *
 * P0 FIX: INITIAL ONBOARDING vs. TRANSFER/ADMINISTRATIVE CHANGE. Once a
 * profile has completed onboarding, POST /api/profile/onboarding must refuse
 * to touch cityId/clubId/positionId again — a CLUB_MANAGER's (and, in the
 * target RBAC model, a CITY_MANAGER's) authority is derived solely from
 * EmployeeProfile.clubId, so re-running this self-service endpoint was a
 * direct privilege-escalation vector. Transfers/role changes belong to an
 * administrative flow, never to self-service onboarding.
 */
export function isOnboardingLocked(
  profile: { onboardingCompleted: boolean } | null | undefined,
): boolean {
  return profile?.onboardingCompleted === true;
}
