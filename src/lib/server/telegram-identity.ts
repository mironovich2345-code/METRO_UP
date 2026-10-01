/**
 * Sprint: mini-app-server-startup, section 1/2/11 — pure (no Prisma/
 * server-only import, unit testable) decision logic for /api/auth/telegram's
 * existing-user fast path: is there anything about this Telegram account's
 * synced metadata that actually needs writing? Kept separate from the route
 * itself for the same reason every other RBAC/gating decision in this
 * codebase is split into a `-core`/pure module — this is the one part of
 * that route genuinely worth a real, DB-free test.
 */
export interface TelegramMetadataFields {
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramPhotoUrl: string | null;
}

/** True iff ANY synced field differs — the auth route treats this as "a
 * write is required now"; false means the existing row can be returned as-is
 * (lastLoginAt is bumped separately, fire-and-forget, never gating this). */
export function hasTelegramMetadataChanged(existing: TelegramMetadataFields, incoming: TelegramMetadataFields): boolean {
  return (
    existing.telegramUsername !== incoming.telegramUsername ||
    existing.telegramFirstName !== incoming.telegramFirstName ||
    existing.telegramLastName !== incoming.telegramLastName ||
    existing.telegramPhotoUrl !== incoming.telegramPhotoUrl
  );
}
