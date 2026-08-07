import "server-only";
import type { CurrentUser } from "./session";
import type { AppUserDTO } from "@/lib/api/types";

/**
 * Client-safe view of the current user. Omits database UUIDs and secrets;
 * exposes only what the UI needs (identity + business profile fields).
 */
export function meDTO(user: CurrentUser): AppUserDTO {
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
  };
}

export type MeDTO = ReturnType<typeof meDTO>;
