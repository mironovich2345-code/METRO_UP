import "server-only";
import type { CurrentUser } from "./session";
import type { AppUserDTO, ViewContextDTO } from "@/lib/api/types";
import { avatarUrlForKey } from "./avatar";

/**
 * Client-safe view of the current user. Omits database UUIDs and secrets;
 * exposes only what the UI needs (identity + business profile fields).
 *
 * `user` may be a real CurrentUser or (Sprint 1 / Phase 2D) the synthetic,
 * non-persisted read persona built by rbac/effective-context.ts for an
 * active MANAGER/CLUB_MANAGER preview — callers pass `viewContext` alongside
 * it in that case so the client can render the "you are previewing" banner.
 * Only GET /api/auth/me ever passes a non-null viewContext; every other
 * caller (auth/telegram, auth/telegram-web, profile/onboarding) always
 * renders the real user with no preview, by construction.
 */
export function meDTO(user: CurrentUser, viewContext?: ViewContextDTO | null): AppUserDTO {
  const p = user.employeeProfile;
  return {
    displayName: user.displayName,
    role: user.role,
    telegram: {
      username: user.telegramUsername,
      firstName: user.telegramFirstName,
      lastName: user.telegramLastName,
      photoUrl: user.telegramPhotoUrl,
    },
    // METRO UP ROUND 1, Milestone 1 — the custom uploaded avatar, if any.
    // Deliberately NOT a fallback to telegram.photoUrl above — "no custom
    // avatar" means the client shows initials, never the Telegram photo.
    avatarUrl: avatarUrlForKey(user.avatarStorageKey ?? null),
    onboardingCompleted: Boolean(p?.onboardingCompleted),
    profile: p
      ? {
          cityId: p.cityId,
          clubId: p.clubId,
          positionId: p.positionId,
          careerLevel: p.careerLevel,
          accessStatus: p.accessStatus,
        }
      : null,
    viewContext: viewContext ?? null,
  };
}

export type MeDTO = ReturnType<typeof meDTO>;
