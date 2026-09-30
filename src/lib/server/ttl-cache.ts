import "server-only";

/**
 * Sprint: mini-app-performance, section 9 — a minimal in-process TTL cache
 * for genuinely shareable, scope-free server reads. ONE process-lifetime
 * Map, cleared naturally on deploy/restart, never persisted, never shared
 * across processes (fine here — every call site below is idempotent and
 * cheap to recompute, so a cold cache on a fresh instance costs one extra
 * query, not a correctness problem).
 *
 * SECURITY (section 9's explicit audit requirement): every current call
 * site (programIdsWithPublishedLessons/getProgramSequence in academy
 * content, getEmployeeScripts/getEmployeeInstructions) takes NO user id, NO
 * club id, NO city id, and reads ONLY rows already gated to
 * status:"PUBLISHED"/isActive:true — the exact same result for every caller,
 * by construction. Do not add a call site here whose result depends on
 * `userId`/`clubId`/`cityId`/any per-actor scope unless the key passed to
 * `cachedForMs` embeds that value — this cache has no per-key access check
 * of its own, so a scope-sensitive read cached under an incomplete key
 * would leak across users/clubs. When in doubt, don't cache it here.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

export async function cachedForMs<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Test-only escape hatch — never called from application code. */
export function __clearTtlCacheForTests() {
  store.clear();
}
