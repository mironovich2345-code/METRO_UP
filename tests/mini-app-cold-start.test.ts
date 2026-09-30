import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { deriveOwnerKey, setOwnerKey } from "../src/lib/client/owner";
import { cacheKeys } from "../src/lib/client/cache-keys";
import { getPersistPolicy } from "../src/lib/client/persistent-cache-core";

/**
 * METRO UP — COLD START / AUTH BOOTSTRAP PERFORMANCE.
 *
 * resolveIdentityPhase (the core reconciliation decision) has its own real
 * coverage in tests/boot-state.test.ts, alongside the pre-existing bootPhase
 * tests it sits next to. This file covers the remaining pure pieces specific
 * to this sprint: owner-key derivation (shared by AppUserProvider and
 * PersistentCacheProvider so their effects never depend on each other's
 * ordering) and the identity-snapshot persist policy (section 9 — a display
 * hint, never authorization). Anything requiring an actual IndexedDB/React
 * render (the parallel-read race in AppUserProvider, PersistentCacheProvider's
 * non-blocking hydration, EmployeeBootGate's real render) is a named,
 * traceable skip stub, matching every prior sprint's convention for
 * environments node:test can't provide.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoHarness = { skip: "integration: requires a DOM/React render harness (not installed under node:test)" } as const;

/* ============================ deriveOwnerKey ============================ */

test("deriveOwnerKey: a real Telegram user id becomes its string form", () => {
  assert.equal(deriveOwnerKey({ id: 12345 }), "12345");
});

test("deriveOwnerKey: null (outside Telegram / not yet known) becomes 'demo'", () => {
  assert.equal(deriveOwnerKey(null), "demo");
});

test("deriveOwnerKey: two different ids never collide", () => {
  assert.notEqual(deriveOwnerKey({ id: 1 }), deriveOwnerKey({ id: 2 }));
});

/* ==================== identity-snapshot persist policy ==================== */

test("PERSIST-POLICY-IDENTITY-A: the identity snapshot IS persist-eligible with a short, bounded TTL (section 7/9)", () => {
  setOwnerKey("user-1");
  const policy = getPersistPolicy(cacheKeys.identitySnapshot());
  assert.ok(policy, "expected the identity snapshot to have a persist policy");
  assert.ok(policy!.ttlMs > 0 && policy!.ttlMs <= 10 * 60_000, "expected a short TTL bounding how stale the display hint can be");
});

test("PERSIST-POLICY-IDENTITY-B: the identity snapshot key is owner-scoped exactly like every other category", () => {
  setOwnerKey("user-1");
  const a = cacheKeys.identitySnapshot();
  setOwnerKey("user-2");
  const b = cacheKeys.identitySnapshot();
  assert.notEqual(a, b);
});

/* ==================== section 9: never a source of authorization ==================== */

test("SECURITY-COLD-START-A: AppUserProvider never sends the cached identity snapshot to any API route as proof of anything — it is only ever read locally (persistent-cache.ts's getEntry) and used to set local React state", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  // The snapshot read/write functions must appear, but never as part of a
  // fetch()/apiFetch() call's request body or headers.
  assert.match(src, /getEntry<AppUserDTO>\(cacheKeys\.identitySnapshot\(\)\)/);
  assert.doesNotMatch(src, /fetch\([^)]*identitySnapshot/);
});

test("SECURITY-COLD-START-B: a confirmed (real) auth result always wins over a slower cached read — the `confirmed` ref guard exists specifically so resolution order can never matter", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  assert.match(src, /confirmed\.current\s*=\s*true/, "expected the real bootstrap to mark itself confirmed on both success and failure");
  assert.match(src, /if\s*\(snap\s*&&\s*!confirmed\.current\)/, "expected the cached-snapshot branch to check the guard before applying");
});

test("SECURITY-COLD-START-C: View As is never persisted into the identity snapshot — persistIdentitySnapshot bails out whenever viewContext is set", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  assert.match(src, /function persistIdentitySnapshot[\s\S]*?if\s*\(user\.viewContext\)\s*return;/);
});

test("SECURITY-COLD-START-D: sign-out deletes the persisted identity snapshot explicitly, not just via the general clearAllQueries sweep (it lives outside the L1/L2 SWR cache clearAllQueries otherwise governs)", () => {
  const src = read("src/providers/AppUserProvider.tsx");
  assert.match(src, /signOut[\s\S]*?deleteEntry\(cacheKeys\.identitySnapshot\(\)\)/);
});

test("SECURITY-COLD-START-E: Home never prefetches or renders CITY_MANAGER/CLUB_MANAGER management content without identityConfirmed", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /dash\.kind === "city_manager" && identityConfirmed/);
  assert.match(src, /identityConfirmed \? \(\s*<CityManagerHomeSection/);
});

/* ==================== IndexedDB/auth parallelism (structural) ==================== */

test("COLD-START-PARALLEL-A: AppUserProvider sits ABOVE PersistentCacheProvider in the provider tree — its bootstrap effect is never gated by IndexedDB hydration", () => {
  const src = read("src/app/providers.tsx");
  const appUserIdx = src.indexOf("<AppUserProvider>");
  const cacheIdx = src.indexOf("<PersistentCacheProvider>");
  assert.ok(appUserIdx >= 0 && cacheIdx >= 0 && appUserIdx < cacheIdx);
});

test("COLD-START-PARALLEL-B: PersistentCacheProvider always renders SWRConfig+children synchronously on first render — no conditional early return in the component body gates it (the old blocking gate was the serialization bug)", () => {
  const src = read("src/providers/PersistentCacheProvider.tsx");
  const body = src.slice(src.indexOf("export function PersistentCacheProvider"));
  assert.doesNotMatch(body, /if\s*\(!cache\)/, "expected no conditional gate on the cache before rendering");
  assert.match(body, /<SWRConfig[\s\S]*>\s*\{children\}\s*<\/SWRConfig>/);
});

/* ==================== traceable skip stubs (need a DOM/React harness) ==================== */

test(
  "COLD-START-RACE-A: whichever of (cached snapshot read) / (real auth response) resolves first is what AppUserProvider renders — verified by code review of the `confirmed` ref guard above; a live race needs a real timer-controlled React render to exercise both orderings",
  skipNoHarness,
  () => {},
);

test(
  "COLD-START-SHELL-A: EmployeeBootGate renders AppShellFrame's chrome (header/nav) immediately once resolveIdentityPhase(...).hydrated is true for EITHER tier — needs a mounted React tree to observe the actual paint",
  skipNoHarness,
  () => {},
);

test(
  "COLD-START-RECONCILE-A: when the real auth response disagrees with the cached snapshot (SUSPENDED, different accessStatus, or an outright 401), the UI corrects within one re-render — AccessStatusGate/ConfirmingAccessPlaceholder already react to `profile`/`identityConfirmed` reactively, but confirming the actual re-render needs a mounted tree",
  skipNoHarness,
  () => {},
);
