import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cacheKeys } from "../src/lib/client/cache-keys";
import { setOwnerKey } from "../src/lib/client/owner";
import { CACHE_SCHEMA_VERSION, isEntryUsable, getPersistPolicy, MAX_ENTRIES, MAX_ENTRY_BYTES } from "../src/lib/client/persistent-cache-core";

/**
 * METRO UP — PERSISTENT MINI APP CACHE (L2/IndexedDB layer).
 *
 * Same split as every prior sprint's test file: persistent-cache-core.ts is
 * pure (no IndexedDB, no React, no "use client" side effects at module
 * scope) and gets real coverage below. persistent-cache.ts itself (the
 * actual IndexedDB reads/writes) and PersistentCacheProvider (the React
 * hydration/remount orchestration) cannot be exercised without a DOM +
 * IndexedDB implementation — not installed, matching this repo's
 * established convention (see mini-app-performance.test.ts's own note on
 * server-only modules for the same reasoning applied to a different
 * unavailable runtime) — covered by named, traceable skip stubs instead.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoIndexedDB = { skip: "integration: requires an IndexedDB implementation (not installed under node:test)" } as const;

/* ===================== cache-key identity (persisted layer) ===================== */
/* Owner/context/club isolation itself is already covered for real by
 * tests/mini-app-performance.test.ts's CACHEKEY-A/B/C/D/E/F/G/H — unchanged
 * by this sprint (cache-keys.ts's key() shape and owner embedding are
 * exactly what persistent-cache-core.ts's getPersistPolicy operates on, not
 * duplicated here). */

test("PERSIST-KEY-A: scripts/instructions detail keys differ per slug, same owner", () => {
  setOwnerKey("user-1");
  assert.notEqual(cacheKeys.scriptDetail("privyv"), cacheKeys.scriptDetail("otkaz"));
  assert.notEqual(cacheKeys.instructionDetail("kassa"), cacheKeys.instructionDetail("dogovor"));
});

/* ============================ getPersistPolicy ============================ */

test("PERSIST-POLICY-A: safe candidates (section 5) all get a persist policy with a positive TTL", () => {
  setOwnerKey("user-1");
  const safeKeys = [
    cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: false }),
    cacheKeys.academyOverview("MANAGER"),
    cacheKeys.academyDay("day-1"),
    cacheKeys.academyLesson("lesson-1", false),
    cacheKeys.ratingBoard(),
    cacheKeys.profileManagementRoles(),
    cacheKeys.cityDashboard(),
    cacheKeys.cityManagers(),
    cacheKeys.cityTraining(),
    cacheKeys.scripts(),
    cacheKeys.scriptDetail("x"),
    cacheKeys.instructions(),
    cacheKeys.instructionDetail("x"),
  ];
  for (const k of safeKeys) {
    const policy = getPersistPolicy(k);
    assert.ok(policy, `expected a persist policy for ${k}`);
    assert.ok(policy!.ttlMs > 0, `expected a positive TTL for ${k}`);
  }
});

test("PERSIST-POLICY-B: sensitive employee-detail/roster keys (section 6) are memory-only — no persist policy at all", () => {
  setOwnerKey("user-1");
  const sensitiveKeys = [
    cacheKeys.team("club-1", false),
    cacheKeys.team(null, false),
    cacheKeys.myManagedClubs(),
    cacheKeys.employeeTraining("employee-1"),
    cacheKeys.cityClub("club-1"),
  ];
  for (const k of sensitiveKeys) {
    assert.equal(getPersistPolicy(k), null, `expected ${k} to be memory-only`);
  }
});

test("PERSIST-POLICY-C: management aggregates (city-dashboard/managers/training) use a SHORT TTL — bounds how long a revoked manager's name/attention item can appear from a stale persisted copy (section 11)", () => {
  setOwnerKey("user-1");
  const MANAGEMENT_SHORT_TTL_CEILING_MS = 5 * 60_000; // generous ceiling, not the exact value — a policy tweak within "short" shouldn't break this test
  for (const k of [cacheKeys.cityDashboard(), cacheKeys.cityManagers(), cacheKeys.cityTraining()]) {
    const policy = getPersistPolicy(k);
    assert.ok(policy && policy.ttlMs <= MANAGEMENT_SHORT_TTL_CEILING_MS, `expected ${k} to have a short TTL`);
  }
});

test("PERSIST-POLICY-D: View As is NEVER persisted, even for an otherwise persist-eligible category — a previewed home response must never survive a restart (section 12)", () => {
  setOwnerKey("user-1");
  const previewedHome = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: true, previewRole: "MANAGER" });
  assert.ok(previewedHome.includes(":preview:"));
  assert.equal(getPersistPolicy(previewedHome), null);

  // The REAL (non-preview) equivalent key, same context, IS persist-eligible —
  // proving the exclusion is specific to the preview tag, not a blanket
  // "home is broken" bug.
  const liveHome = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: false });
  assert.notEqual(getPersistPolicy(liveHome), null);
});

/* ============================ isEntryUsable ============================ */

test("PERSIST-ENTRY-A: expired entry ignored — expiresAt in the past is never usable regardless of version", () => {
  const now = Date.now();
  assert.equal(isEntryUsable({ cacheVersion: CACHE_SCHEMA_VERSION, expiresAt: now - 1 }, now), false);
});

test("PERSIST-ENTRY-B: cacheVersion mismatch ignored — a future/older schema version is never usable even if not yet expired", () => {
  const now = Date.now();
  assert.equal(isEntryUsable({ cacheVersion: CACHE_SCHEMA_VERSION + 1, expiresAt: now + 60_000 }, now), false);
  assert.equal(isEntryUsable({ cacheVersion: CACHE_SCHEMA_VERSION - 1, expiresAt: now + 60_000 }, now), false);
});

test("PERSIST-ENTRY-C: correct version AND not-yet-expired IS usable", () => {
  const now = Date.now();
  assert.equal(isEntryUsable({ cacheVersion: CACHE_SCHEMA_VERSION, expiresAt: now + 60_000 }, now), true);
});

test("PERSIST-ENTRY-D: an entry expiring at exactly `now` is treated as already expired (strict >), never a false positive at the boundary", () => {
  const now = Date.now();
  assert.equal(isEntryUsable({ cacheVersion: CACHE_SCHEMA_VERSION, expiresAt: now }, now), false);
});

/* ============================ storage bounds ============================ */

test("PERSIST-BOUNDS-A: MAX_ENTRIES and MAX_ENTRY_BYTES are both finite, positive bounds (section 15) — this cache cannot grow without limit by construction", () => {
  assert.ok(Number.isFinite(MAX_ENTRIES) && MAX_ENTRIES > 0);
  assert.ok(Number.isFinite(MAX_ENTRY_BYTES) && MAX_ENTRY_BYTES > 0);
});

/* ==================== persistent cache never sources authz ================== */

test("SECURITY-PERSIST-A: persistent-cache-core.ts / persistent-cache.ts / persistent-swr-cache.ts never import server/RBAC modules — L2 cannot stand in for a server authorization decision", () => {
  for (const file of ["src/lib/client/persistent-cache-core.ts", "src/lib/client/persistent-cache.ts", "src/lib/client/persistent-swr-cache.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /@\/lib\/server/, `${file} must not import a server module`);
    assert.doesNotMatch(src, /authorize/i, `${file} must not reference authorization logic`);
  }
});

test("SECURITY-PERSIST-B: PersistentCacheProvider never bypasses AppUserProvider's own auth gate — it wraps AppUserProvider in the tree (providers.tsx), never the other way around, so the real session bootstrap is untouched by cache hydration", () => {
  const src = read("src/app/providers.tsx");
  const persistIdx = src.indexOf("PersistentCacheProvider>");
  const appUserIdx = src.indexOf("<AppUserProvider>");
  assert.ok(persistIdx >= 0 && appUserIdx >= 0 && persistIdx < appUserIdx, "expected PersistentCacheProvider to wrap AppUserProvider, not replace it");
});

/* ==================== hydration/owner-change/logout (traceable skip stubs) ================== */

test(
  "PERSIST-HYDRATE-A: on cold reopen, hydrateOwnerEntries(ownerKey) reads only THIS owner's rows (IndexedDB `by_owner` index) into the Map handed to SWRConfig — a different owner's rows in the SAME store are never returned, matching cache-keys.ts's own owner-embedded key design",
  skipNoIndexedDB,
  () => {},
);

test(
  "PERSIST-HYDRATE-B: hydrateOwnerEntries also deletes any expired-or-version-mismatched row it encounters during its scan (any owner), and evicts the oldest surviving rows beyond MAX_ENTRIES — the store never grows without bound across many app opens",
  skipNoIndexedDB,
  () => {},
);

test(
  "PERSIST-OWNER-CHANGE-A: a genuine owner change (PersistentCacheProvider's previousOwner ref differs from the newly-read Telegram user id) calls deleteAllForOwner(oldOwner) BEFORE hydrating the new owner — user A's persisted entries are gone before user B's are ever read, not merely superseded by a different key namespace",
  skipNoIndexedDB,
  () => {},
);

test(
  "PERSIST-LOGOUT-A: signOut() (AppUserProvider) calls clearAllQueries(), which now also calls clearAllEntries() (persistent-cache.ts) — a signed-out session never leaves anything in IndexedDB for a hypothetical next session in the same WebView to inherit, independent of any entry's own TTL",
  skipNoIndexedDB,
  () => {},
);

test(
  "PERSIST-MUTATION-A: invalidate/invalidatePrefix (query-cache.ts) now call deleteEntry/deleteEntriesByPrefix (persistent-cache.ts) BEFORE the corresponding globalMutate call — every mutation invalidation from the performance sprint (approve/assign/revoke/restore/plan/lesson) now clears L2 for the same keys it already cleared in L1, verified by code review of query-cache.ts's invalidate/invalidatePrefix/clearAllQueries bodies",
  skipNoIndexedDB,
  () => {},
);

test(
  "REOPEN-UX-A: on a cold reopen with a valid persisted Home entry, useQuery's isWithinReopenGrace() suppresses isValidating for ~4s after PersistentCacheProvider's markAppOpened() — RevalidatingBar (show={Boolean(data) && isValidating}) never renders during that window even though SWR's real background revalidation still runs and still updates data the moment it arrives",
  skipNoIndexedDB,
  () => {},
);
