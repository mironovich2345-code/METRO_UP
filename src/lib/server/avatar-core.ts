/**
 * METRO UP ROUND 1, Milestone 1 — pure (no Prisma/server-only import, unit
 * testable) pieces of the avatar upload flow, split out of avatar.ts for the
 * same reason every other `-core.ts` module in this codebase exists: the
 * actual security-relevant DECISION ("does this storage key belong to this
 * user") deserves real test coverage independent of a live DB/storage
 * connection.
 */

export function avatarKeyPrefix(userId: string): string {
  return `avatars/${userId}/`;
}

/** The ownership check completeAvatarUpload enforces — a storage key can
 * only be completed by the exact user whose namespace it falls under,
 * derived entirely from the session-authenticated userId, never from
 * anything the client asserts about itself. */
export function isOwnAvatarKey(userId: string, storageKey: string): boolean {
  return storageKey.startsWith(avatarKeyPrefix(userId));
}

export const AVATAR_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extForAvatarMime(mimeType: string): string {
  return AVATAR_EXT_BY_MIME[mimeType] ?? "jpg";
}
