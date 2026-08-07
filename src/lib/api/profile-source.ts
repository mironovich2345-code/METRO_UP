import type { AppUserDTO } from "./types";

export type ProfileSource = "server" | "local" | "none";

/**
 * Decide which profile is authoritative. The server ALWAYS wins: whenever a
 * completed server profile exists it overrides any locally-stored profile.
 * localStorage is only used as a prefill/cache when there is no server profile.
 */
export function resolveProfileSource(
  serverUser: AppUserDTO | null,
  hasLocalProfile: boolean,
): ProfileSource {
  if (serverUser && serverUser.onboardingCompleted && serverUser.profile) {
    return "server";
  }
  if (hasLocalProfile) return "local";
  return "none";
}
