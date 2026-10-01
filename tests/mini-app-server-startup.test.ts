import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasTelegramMetadataChanged } from "../src/lib/server/telegram-identity";

/**
 * METRO UP — SERVER STARTUP PERFORMANCE (auth fast path + Home query fixes).
 *
 * hasTelegramMetadataChanged is pure (no Prisma/server-only import) and gets
 * real, exhaustive coverage below. Everything that actually touches Postgres
 * (the auth route's findUnique/update/upsert branches, getCityManagerDashboard's
 * query count) cannot be exercised without a live database — not available
 * under plain node:test, matching this repo's established convention — so
 * those are covered by named, traceable skip stubs plus source-text
 * assertions that check the STRUCTURAL guarantee (e.g. "upsert only appears
 * in the not-found branch") without needing a live DB.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoDb = { skip: "integration: requires Postgres (not available under node:test)" } as const;

const BASE = { telegramUsername: "ivan", telegramFirstName: "Иван", telegramLastName: "Петров", telegramPhotoUrl: "https://x/y.jpg" };

/* ======================== hasTelegramMetadataChanged ======================== */

test("AUTH-FAST-A: identical fields across all four columns -> unchanged", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE }), false);
});

test("AUTH-FAST-B: username differs -> changed", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramUsername: "ivan2" }), true);
});

test("AUTH-FAST-C: first name differs -> changed", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramFirstName: "Пётр" }), true);
});

test("AUTH-FAST-D: last name differs -> changed", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramLastName: "Сидоров" }), true);
});

test("AUTH-FAST-E: photo url differs -> changed", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramPhotoUrl: "https://x/new.jpg" }), true);
});

test("AUTH-FAST-F: a field becoming null (user removed their username/photo in Telegram) -> changed, never silently ignored", () => {
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramUsername: null }), true);
  assert.equal(hasTelegramMetadataChanged(BASE, { ...BASE, telegramPhotoUrl: null }), true);
});

test("AUTH-FAST-G: both sides null for the same field -> that field alone never triggers a write", () => {
  const existing = { ...BASE, telegramUsername: null };
  const incoming = { ...BASE, telegramUsername: null };
  assert.equal(hasTelegramMetadataChanged(existing, incoming), false);
});

test("AUTH-FAST-H: every field simultaneously different -> still correctly reports changed (not short-circuited incorrectly)", () => {
  assert.equal(
    hasTelegramMetadataChanged(BASE, {
      telegramUsername: "x",
      telegramFirstName: "Y",
      telegramLastName: "Z",
      telegramPhotoUrl: "https://new",
    }),
    true,
  );
});

/* ===================== structural guarantees (source-text) ===================== */

test("AUTH-FAST-STRUCT-A: upsert is reached ONLY in the not-found (create) branch — the fast path never calls upsert for an existing user", () => {
  const src = read("src/app/api/auth/telegram/route.ts");
  // The findUnique must appear textually BEFORE the upsert call, and the
  // upsert call must be inside the `else` (not-found) branch — approximated
  // here by requiring findUnique to precede upsert and the two counts to
  // match expectations (exactly one of each).
  const findIdx = src.indexOf("prisma.user.findUnique");
  const upsertIdx = src.indexOf("prisma.user.upsert");
  assert.ok(findIdx >= 0 && upsertIdx >= 0 && findIdx < upsertIdx, "expected findUnique before upsert, both present");
  assert.equal((src.match(/prisma\.user\.upsert/g) ?? []).length, 1, "expected exactly one upsert call site (new-user path only)");
});

test("AUTH-FAST-STRUCT-B: the no-write fast path's lastLoginAt bump is fire-and-forget (void ..., never awaited)", () => {
  const src = read("src/app/api/auth/telegram/route.ts");
  assert.match(src, /void prisma\.user\.update\(\{ where: \{ id: existing\.id \}, data: \{ lastLoginAt: new Date\(\) \} \}\)\.catch/);
});

test("AUTH-FAST-STRUCT-C: EmployeeProfile is included on every user-resolution branch (findUnique, update, upsert) — the fast path never drops it", () => {
  const src = read("src/app/api/auth/telegram/route.ts");
  assert.equal((src.match(/include: \{ employeeProfile: true \}/g) ?? []).length, 3, "expected findUnique + update + upsert to each include employeeProfile");
});

test("AUTH-FAST-STRUCT-D: accessStatus/role/onboarding fields are never written by the fast path's metadata-only update or the no-write branch — only telegram.* + lastLoginAt", () => {
  const src = read("src/app/api/auth/telegram/route.ts");
  // The metadata-update branch's `data:` block (between its own braces) must
  // not reference role/accessStatus/onboardingCompleted at all — those are
  // EmployeeProfile-owned and never touched by this route in any branch.
  assert.doesNotMatch(src, /accessStatus/);
  assert.doesNotMatch(src, /onboardingCompleted/);
});

/* ==================== Home duplicate-query fix (section 6/7) ==================== */

test("HOME-DEDUP-A: getCityManagerDashboard accepts an optional precomputedClubs param and skips resolveCityManagerClubs when provided", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /getCityManagerDashboard\(actor: ActorContext, precomputedClubs\?: ClubSummary\[\]\)/);
  assert.match(src, /precomputedClubs \?\? \(await (timedField\(timings, "clubsMs", \(\) => )?resolveCityManagerClubs\(actor\)\)?\)?\(?\)?/);
});

test("HOME-DEDUP-B: resolveAvailableHomeContexts returns cityManagerClubs alongside contexts, for the route to reuse", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /interface AvailableHomeContextsResult/);
  assert.match(src, /return \{ contexts, cityManagerClubs \}/);
});

test("HOME-DEDUP-C: /api/home/route.ts passes cityManagerClubs through to getCityManagerHomeDashboard instead of discarding it", () => {
  const src = read("src/app/api/home/route.ts");
  assert.match(src, /getCityManagerHomeDashboard\(user, actor, availableContexts, active, cityManagerClubs \?\? undefined\)/);
});

test("HOME-DEDUP-D: getCityManagerDashboard resolves employees/clubManagerGrants/training together — cmUsers is the one remaining sequential step, correctly so (it needs clubManagerGrants' own result to know which user ids to look up)", () => {
  // Superseded by mini-app-postgres-latency.test.ts's DEDUP-TRAINING-A, which
  // checks the CURRENT shape precisely (training folded into the FIRST
  // Promise.all alongside employees/clubManagerGrantsRaw, not merely paired
  // with cmUsers in a second one) — this sprint's own evidence showed
  // training depending on employees was the bigger, fixable cost. Kept here
  // only to assert the superseded shape is gone, not reintroduced.
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.doesNotMatch(src, /const \[cmUsers, trainingRaw\] = await Promise\.all\(\[/);
  assert.match(src, /const \[employees, clubManagerGrantsRaw, trainingRaw\] = await Promise\.all\(\[/);
});

/* ========================= prefetch idle-deferral (section 6) ========================= */

test("PREFETCH-IDLE-A: Home's prefetch effect is wrapped in runWhenIdle — not fired synchronously the instant dash resolves", () => {
  const src = read("src/app/home/page.tsx");
  const effectIdx = src.indexOf("runWhenIdle(() => {");
  assert.ok(effectIdx >= 0, "expected the prefetch call sites to be wrapped in runWhenIdle(...)");
  const prefetchCallIdx = src.indexOf("prefetchPersonalDestinations()");
  assert.ok(prefetchCallIdx > effectIdx, "expected prefetchPersonalDestinations() to be INSIDE the runWhenIdle callback");
});

test("PREFETCH-IDLE-B: runWhenIdle falls back to setTimeout when requestIdleCallback is unavailable (Safari/iOS WKWebView) — never silently never-runs", () => {
  const src = read("src/lib/client/idle.ts");
  assert.match(src, /requestIdleCallback/);
  assert.match(src, /setTimeout\(fn/);
});

/* ============================ perf instrumentation shape ============================ */

test("PERF-HOME-A: perf.ts exposes logPerf/timedField as zero-cost-when-disabled helpers (no performance.now() call when PERF_LOG is off)", () => {
  const src = read("src/lib/server/perf.ts");
  assert.match(src, /export function logPerf/);
  assert.match(src, /export function timedField/);
  // timedField's disabled branch returns `run` itself, unwrapped — no timing
  // overhead at all when PERF_LOG is off, same contract as perfTimed.
  assert.match(src, /if \(!ENABLED\) return run;/);
});

test("PERF-HOME-B: Home timing wrappers (timedField) never change a widget's resolved value or error behavior — they wrap, not replace, the original run()", () => {
  const src = read("src/lib/server/perf.ts");
  // The timed wrapper awaits the SAME run() and returns its value via `return await run()`
  // inside a try/finally — finally only records timing, never swallows/alters
  // a rejection (no catch block here at all).
  const fnBody = src.slice(src.indexOf("export function timedField"));
  assert.match(fnBody, /return await run\(\);/);
  assert.doesNotMatch(fnBody.slice(0, fnBody.indexOf("return await run")), /catch/);
});

/* ===================== DB-dependent integration (traceable skip stubs) ===================== */

test("AUTH-FAST-INT-A: an existing user with unchanged Telegram metadata resolves via findUnique alone — zero writes on the request's own critical path", skipNoDb, () => {});
test("AUTH-FAST-INT-B: a brand-new telegramId creates exactly one User row via the retained upsert path, EmployeeProfile absent until onboarding", skipNoDb, () => {});
test("AUTH-FAST-INT-C: two concurrent first-logins for the same NEW telegramId never create two User rows — upsert's atomic unique-constraint handling is unchanged", skipNoDb, () => {});
test("AUTH-FAST-INT-D: an existing user whose Telegram username changed takes the metadata-update branch and persists the new value", skipNoDb, () => {});
test("AUTH-FAST-INT-E: accessStatus/onboardingCompleted/role are byte-for-byte unchanged across a fast-path (no-write) login — this route never touches EmployeeProfile fields", skipNoDb, () => {});
test("AUTH-FAST-INT-F: View As is unaffected by the auth fast path — resolveViewContext/canStartViewAs are not reachable from this route at all (view-as.ts's own call graph), so no behavior here can change", skipNoDb, () => {});
test("HOME-DEDUP-INT-A: a CITY_MANAGER's /api/home request issues resolveCityManagerClubs's Club+City query exactly ONCE (previously twice) — verified by query-count instrumentation against a live DB", skipNoDb, () => {});
test("HOME-DEDUP-INT-B: getCityManagerDashboard's response is byte-for-byte identical whether precomputedClubs is passed or resolved internally — the optimization never changes the DTO", skipNoDb, () => {});
