/**
 * Sprint: mini-app-context-switcher, section 8 — persists ONLY which Home
 * context (PERSONAL / CLUB_MANAGER+clubId / CITY_MANAGER) was last selected,
 * a pure UI preference. Never authorization: the server independently
 * re-validates whatever this returns against the real actor's CURRENT
 * grants on every request (resolveActiveContext, cabinet-ui.ts) and falls
 * back to PERSONAL if it's no longer valid — this file cannot grant access
 * to anything by itself, even if tampered with directly in devtools.
 *
 * Scoped by `ownerKey` (the Telegram account id — already client-visible,
 * not a DB secret) so one shared device / account switch inside Telegram
 * does not silently inherit a different account's last-selected context
 * (section 8's explicit requirement).
 */

export interface StoredHomeContext {
  type: "PERSONAL" | "CLUB_MANAGER" | "CITY_MANAGER";
  clubId?: string;
}

const STORAGE_KEY = "metro_up_active_context_v1";

interface StoredPayload {
  ownerKey: string;
  context: StoredHomeContext;
}

function isStoredHomeContext(v: unknown): v is StoredHomeContext {
  if (!v || typeof v !== "object") return false;
  const type = (v as { type?: unknown }).type;
  return type === "PERSONAL" || type === "CLUB_MANAGER" || type === "CITY_MANAGER";
}

/** Returns null on anything unexpected (no storage, wrong owner, malformed
 * JSON, unrecognized shape) — callers treat null exactly like "nothing
 * persisted yet", never a crash. */
export function loadStoredContext(ownerKey: string): StoredHomeContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPayload>;
    if (parsed.ownerKey !== ownerKey || !isStoredHomeContext(parsed.context)) return null;
    return parsed.context;
  } catch {
    return null;
  }
}

/** Persists exactly what the server told us is currently active (never a
 * client-side guess) — see home/page.tsx's post-fetch save. Best-effort:
 * a localStorage failure (private mode, quota) is silently ignored, since
 * this is a non-critical UI preference, never a source of truth. */
export function saveStoredContext(ownerKey: string, context: StoredHomeContext): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ownerKey, context } satisfies StoredPayload));
  } catch {
    /* noop */
  }
}
