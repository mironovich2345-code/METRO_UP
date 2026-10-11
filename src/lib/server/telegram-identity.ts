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

/** The Telegram user fields both auth routes receive (Mini App initData and
 * the Login Widget share these names). */
export interface TelegramUserPayload {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/**
 * Sprint: LIVE QA QA-02 — the ONLY columns Telegram may write on an EXISTING
 * user, used by both /api/auth/telegram and /api/auth/telegram-web for their
 * metadata update (and the change check above). It deliberately has no
 * `displayName`: that is the employee's own app-owned name, editable in
 * Profile, so a Telegram reopen can never revert it.
 */
export function telegramMetadataFrom(tg: TelegramUserPayload): TelegramMetadataFields {
  return {
    telegramUsername: tg.username ?? null,
    telegramFirstName: tg.first_name ?? null,
    telegramLastName: tg.last_name ?? null,
    telegramPhotoUrl: tg.photo_url ?? null,
  };
}

/** Sprint: LIVE QA QA-02 — the starting displayName for a BRAND-NEW user only
 * (the `create` branch). Same rule both auth routes already used inline. */
export function initialDisplayNameFrom(tg: TelegramUserPayload): string {
  return [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.first_name || "Сотрудник";
}
