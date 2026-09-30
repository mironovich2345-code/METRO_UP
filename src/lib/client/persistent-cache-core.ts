/**
 * Sprint: mini-app-persistent-cache — pure, DB/IndexedDB-free decision logic
 * for the L2 persistent cache. Kept separate from persistent-cache.ts (the
 * actual IndexedDB-touching module) specifically so this has real, DB-free
 * test coverage — same reasoning as gating-core.ts/scope-core.ts throughout
 * this codebase.
 */

/**
 * Bumped whenever the PersistedEntry SHAPE changes incompatibly (a field
 * renamed/removed, a data contract change that would make an old entry
 * unsafe to feed back into SWR as-is). Every entry carries the version it
 * was written under; hydration discards anything that doesn't match the
 * CURRENT value — "cacheVersion mismatch ignored" (section 2/16). Bumping
 * this is the ONE supported way to invalidate every persisted entry at
 * once (e.g. after a DTO shape change) without touching IndexedDB by hand.
 */
export const CACHE_SCHEMA_VERSION = 1;

export interface PersistedEntry {
  key: string;
  ownerKey: string;
  data: unknown;
  savedAt: number;
  expiresAt: number;
  cacheVersion: number;
}

/** True iff this entry is safe to feed back into SWR's cache right now —
 * correct schema version AND not yet expired. Never checks WHO is asking;
 * the caller (persistent-cache.ts) only ever queries entries already
 * filtered by ownerKey via the IndexedDB index, so this only needs to
 * re-verify the two things a single entry can independently go stale on. */
export function isEntryUsable(entry: Pick<PersistedEntry, "cacheVersion" | "expiresAt">, now: number): boolean {
  return entry.cacheVersion === CACHE_SCHEMA_VERSION && entry.expiresAt > now;
}

/** Section 15 — bounded storage. Entry-count cap (simple, no need to
 * serialize every record to estimate bytes) plus a per-entry byte guard at
 * write time (persistEntry) so one unexpectedly large response can never
 * alone blow past a reasonable budget — this cache only ever holds small
 * JSON/API responses, never media. */
export const MAX_ENTRIES = 200;
export const MAX_ENTRY_BYTES = 200_000;

/**
 * Section 5/6/7 — which SWR key categories may be written to L2 at all, and
 * for how long. Derived from the key's category prefix (the first `:`-
 * separated segment — see cache-keys.ts's `key()` builder). Absent from
 * this table = memory-only (L1 SWR only, never persisted) — the DEFAULT,
 * per section 6's "default toward not persisting detailed employee PII".
 *
 * Persisted (all genuinely shareable-shaped or "my own" data, no full
 * employee roster anywhere in the payload):
 *  - home: 3 min. Section 5's own named example; the primary "instant
 *    reopen" target. Contains some attention-item entity names, same
 *    exposure the app already renders live today.
 *  - academy-overview/day/lesson: 30 min. Published structure + the
 *    viewer's OWN progress only — no other person's data at all.
 *  - rating: 10 min. A published leaderboard everyone eligible already
 *    sees live — not materially more sensitive persisted than rendered.
 *  - profile-management-roles: 10 min. The ACTOR's own roles/clubs, never
 *    another person's data.
 *  - city-dashboard/city-managers/city-training: 2 min ("management
 *    aggregates: short"). Contains club-manager display names and
 *    attention entity names, but no full roster or per-employee detail.
 *  - scripts/script-detail/instructions/instruction-detail: 30 min
 *    ("knowledge-base metadata/content: longer"). Published content, no
 *    per-user data whatsoever — the same category of safety as Academy
 *    structure.
 *
 * Deliberately memory-only (never persisted), per section 6's "default
 * toward not persisting detailed employee PII":
 *  - team: bundles the full per-club employee roster (names, positions,
 *    Academy progress, latest test result per person).
 *  - city-club: bundles that SAME roster (cabinetApi.clubManagerTeam)
 *    alongside the city dashboard — the roster half makes the whole
 *    response as sensitive as `team`, even though the dashboard half alone
 *    would have been safe; splitting the two into separate fetches purely
 *    to allow partial persistence was judged a larger, riskier change than
 *    this round's evidence justified (see the report).
 *  - employee-training: one individual's detailed lesson/quiz history.
 *  - team-my-clubs: cheap to refetch, tightly coupled to the team flow's
 *    own club-selection logic; kept simple by staying memory-only too.
 */
const PERSIST_TTL_MS: Record<string, number> = {
  home: 3 * 60_000,
  "academy-overview": 30 * 60_000,
  "academy-day": 30 * 60_000,
  "academy-lesson": 30 * 60_000,
  rating: 10 * 60_000,
  "profile-management-roles": 10 * 60_000,
  "city-dashboard": 2 * 60_000,
  "city-managers": 2 * 60_000,
  "city-training": 2 * 60_000,
  scripts: 30 * 60_000,
  "script-detail": 30 * 60_000,
  instructions: 30 * 60_000,
  "instruction-detail": 30 * 60_000,
};

/**
 * Section 12 — View As must NEVER be persisted across restarts, full stop,
 * regardless of which category the key otherwise belongs to. Every key
 * whose response shape depends on an active preview embeds a
 * `:preview:<role>` segment (cache-keys.ts's previewTag) — checked here
 * FIRST, before the category lookup, so a previewed `home:` response (home
 * IS otherwise persist-eligible) can never slip through.
 */
export function getPersistPolicy(key: string): { ttlMs: number } | null {
  if (key.includes(":preview:")) return null;
  const category = key.split(":")[0];
  const ttlMs = PERSIST_TTL_MS[category];
  return ttlMs ? { ttlMs } : null;
}
