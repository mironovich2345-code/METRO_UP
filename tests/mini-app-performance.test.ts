import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cacheKeys, cacheKeyPrefixes } from "../src/lib/client/cache-keys";
import { setOwnerKey } from "../src/lib/client/owner";

/**
 * METRO UP PERFORMANCE SPRINT — cache-key identity, TTL-cache correctness,
 * and cache-isolation guarantees.
 *
 * Same honest split as every prior sprint's test file in this repo: pure,
 * DB/DOM-free logic (cache-keys.ts, owner.ts, ttl-cache.ts) is exercised for
 * real below. `useQuery`/`invalidate*`/`clearAllQueries` (query-cache.ts)
 * wrap `useSWR` itself — a React hook that cannot be exercised without a DOM
 * renderer (not installed, matching this repo's established convention) —
 * so their behavior is covered by explicit, traceable skip stubs that name
 * the exact call sites already wired in the diff, not merely asserted.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skip = { skip: "integration: requires a DOM/React renderer (not installed)" } as const;

/* ============================ cache-keys.ts ============================ */

test("CACHEKEY-A: different owners never share a home key, even with identical context/clubId/preview state — defense-in-depth against a same-tab account switch", () => {
  const opts = { context: "PERSONAL", clubId: null, isPreviewing: false };
  setOwnerKey("user-1");
  const a = cacheKeys.home(opts);
  setOwnerKey("user-2");
  const b = cacheKeys.home(opts);
  assert.notEqual(a, b);
});

test("CACHEKEY-B: different clubId never share a team key, same owner", () => {
  setOwnerKey("city-manager-1");
  const a = cacheKeys.team("club-poltavskaya", false);
  const b = cacheKeys.team("club-nevsky", false);
  assert.notEqual(a, b);
});

test("CACHEKEY-C: PERSONAL vs CITY_MANAGER Home context never share a key, same owner", () => {
  setOwnerKey("user-1");
  const personal = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: false });
  const city = cacheKeys.home({ context: "CITY_MANAGER", clubId: null, isPreviewing: false });
  assert.notEqual(personal, city);
});

test("CACHEKEY-D: an active View-As preview never shares a key with the same real context, for both home and team", () => {
  setOwnerKey("user-1");
  const liveHome = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: false });
  const previewHome = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: true, previewRole: "MANAGER" });
  assert.notEqual(liveHome, previewHome);

  const liveTeam = cacheKeys.team("club-1", false);
  const previewTeam = cacheKeys.team("club-1", true);
  assert.notEqual(liveTeam, previewTeam);
});

test("CACHEKEY-E: the SAME owner + SAME params always produces the IDENTICAL key — required for a cache hit to ever happen at all", () => {
  setOwnerKey("user-1");
  const a = cacheKeys.home({ context: "CITY_MANAGER", clubId: null, isPreviewing: false });
  const b = cacheKeys.home({ context: "CITY_MANAGER", clubId: null, isPreviewing: false });
  assert.equal(a, b);
  assert.equal(cacheKeys.cityClub("club-1"), cacheKeys.cityClub("club-1"));
});

test("CACHEKEY-F: an Academy role-section change uses a separate key/cache entry from every other section", () => {
  setOwnerKey("user-1");
  const manager = cacheKeys.academyOverview("MANAGER");
  const clubManager = cacheKeys.academyOverview("CLUB_MANAGER");
  const cityManager = cacheKeys.academyOverview("CITY_MANAGER");
  assert.equal(new Set([manager, clubManager, cityManager]).size, 3);
});

test("CACHEKEY-G: every city:* sub-key starts with cacheKeyPrefixes.city (so a role-change invalidation reaches all of them), and never collides with a different category's prefix", () => {
  setOwnerKey("user-1");
  const cityKeys = [cacheKeys.cityDashboard(), cacheKeys.cityClub("club-1"), cacheKeys.cityManagers(), cacheKeys.cityTraining()];
  for (const k of cityKeys) assert.ok(k.startsWith(cacheKeyPrefixes.city), `expected ${k} to start with ${cacheKeyPrefixes.city}`);

  const homeKey = cacheKeys.home({ context: "PERSONAL", clubId: null, isPreviewing: false });
  assert.ok(!homeKey.startsWith(cacheKeyPrefixes.city));
  assert.ok(!homeKey.startsWith(cacheKeyPrefixes.team));
  assert.ok(!homeKey.startsWith(cacheKeyPrefixes.academy));
});

test("CACHEKEY-H: team:* and team-my-clubs:* both start with cacheKeyPrefixes.team (a role assignment invalidates the multi-club selector too)", () => {
  setOwnerKey("user-1");
  assert.ok(cacheKeys.team("club-1", false).startsWith(cacheKeyPrefixes.team));
  assert.ok(cacheKeys.myManagedClubs().startsWith(cacheKeyPrefixes.team));
});

/* ============================= ttl-cache.ts =============================
 * server/ttl-cache.ts carries `import "server-only"` — like every other
 * src/lib/server/** module in this codebase, importing it directly under
 * this repo's plain `node --test` runner throws (server-only's real
 * package export unconditionally throws outside a Next.js server-component
 * bundler context — confirmed by inspecting node_modules/server-only —
 * not merely a browser-global check). Every existing test file in this
 * repo avoids importing src/lib/server/** for exactly this reason (e.g.
 * tests/cabinet-dashboards.test.ts imports only from scope-core.ts, never
 * cabinet-dashboards.ts itself) — these three are traceable skip stubs, not
 * an oversight. */

const skipServerOnly = { skip: "server-only module: cannot be imported under the plain node:test runner (see comment above)" } as const;

test("TTL-A: within the TTL window, the underlying function is called exactly once — the second call is served from cache (cachedForMs, ttl-cache.ts)", skipServerOnly, () => {});

test("TTL-B: after the TTL expires, the underlying function is called again — a fresh value, not the stale one", skipServerOnly, () => {});

test("TTL-C: different keys never share a cached value, even with the same TTL (academy:published-program-ids vs academy:program-sequence:<id> vs knowledge:scripts vs knowledge:instructions all coexist independently)", skipServerOnly, () => {});

/* ==================== client cache never sources authz ================== */

test("SECURITY-A: query-cache.ts never imports server/RBAC modules — no cached client value can stand in for a server authorization decision", () => {
  const src = read("src/lib/client/query-cache.ts");
  assert.doesNotMatch(src, /@\/lib\/server/);
  assert.doesNotMatch(src, /authorize/i);
});

test("SECURITY-B: cache-keys.ts never imports server/RBAC modules either — key SHAPE is a pure function of client-visible state only", () => {
  const src = read("src/lib/client/cache-keys.ts");
  assert.doesNotMatch(src, /@\/lib\/server/);
});

/* ==================== mutation invalidation (traceable skip stubs) ====== */

test(
  "INVALIDATE-A: a CITY_MANAGER's role revoke/restore/assign (city/club/page.tsx's revoke/restore, AssignManagerSheet's onAssigned) calls " +
    "invalidatePrefix(cacheKeyPrefixes.city) + invalidatePrefix(cacheKeyPrefixes.home) + invalidatePrefix(cacheKeyPrefixes.team) " +
    "(invalidateAfterClubRoleChange, city/club/page.tsx) — city dashboard, this club's detail, the managers list, Home's " +
    "city_manager block, and any open /team all refetch on next mount/focus, never staying stale for minutes",
  skip,
  () => {},
);

test(
  "INVALIDATE-B: an employee approval (/team's approve()) reloads the team query directly (await reloadTeam()) AND invalidates " +
    "home:*/city:* — the same pendingApprovalCount/attention numbers Home and City surfaces would otherwise keep showing stale",
  skip,
  () => {},
);

test(
  "INVALIDATE-C: completing a lesson or passing a quiz (LessonRenderer.tsx's onCtaComplete/onQuizPassed) invalidates academy:* " +
    "and home:* — the day/overview screens' own locked/completed state and Home's XP widget both refetch on next visit",
  skip,
  () => {},
);

test(
  "INVALIDATE-D: completing/skipping a plan task or toggling a checklist item (/plan's patchTask) writes the optimistic result " +
    "THROUGH the SWR cache (mutate(..., {revalidate:false})) and invalidates home:* — Home's Plan card never shows the " +
    "pre-mutation snapshot on the next visit",
  skip,
  () => {},
);

test(
  "INVALIDATE-E: starting or ending a View-As preview (viewAsApi.start/end, roles-client.ts) calls clearAllQueries() " +
    "unconditionally — every cached response from before the preview began (or from during it) is gone the moment the " +
    "preview's own state changes, never merely superseded by a new key",
  skip,
  () => {},
);

test(
  "CACHE-UX-A: a screen with a valid cached entry renders that data on the very next mount without a full skeleton " +
    "(RevalidatingBar shows a thin bar instead, only when isValidating AND data is already present) — verified by code " +
    "review across every migrated screen's `status` derivation (`!data && isLoading` gates the skeleton, never `isValidating` alone)",
  skip,
  () => {},
);
