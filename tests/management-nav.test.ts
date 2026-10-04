import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BOTTOM_NAV_ROUTES,
  CLUB_MANAGER_NAV_ROUTES,
  CITY_MANAGER_NAV_ROUTES,
  visibleBottomNavRoutes,
  resolveEffectiveNavContext,
  isActiveNavRoute,
} from "../src/lib/nav-items";

/**
 * METRO UP, Management UX Round A — shared management primitives +
 * context-aware management navigation. nav-items.ts is pure (no React
 * import) and gets real, direct coverage below, matching this repo's
 * established convention. The new management-primitives.tsx component
 * file has no DOM harness to render-test (this repo's established
 * convention — see e.g. employee-questions.test.ts's own header) — covered
 * by source-text structural checks for the one guarantee that matters most
 * (section 10's attention-vs-neutral color split), plus which pages do/
 * don't render BottomNavigation and do/don't import the new primitives.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/* ============================== PERSONAL: unchanged ============================== */

test("PERSONAL-A: BOTTOM_NAV_ROUTES is unchanged — 5 items, same hrefs, same order", () => {
  assert.deepEqual(BOTTOM_NAV_ROUTES.map((r) => r.href), ["/home", "/academy", "/metric", "/knowledge", "/ranking"]);
});

test("PERSONAL-B: visibleBottomNavRoutes called with no effectiveContext argument (every pre-existing call site) still returns the unchanged 5-item PERSONAL bar", () => {
  assert.equal(visibleBottomNavRoutes("FULL").length, 5);
  assert.deepEqual(visibleBottomNavRoutes("FULL").map((r) => r.href), ["/home", "/academy", "/metric", "/knowledge", "/ranking"]);
});

test("PERSONAL-C: visibleBottomNavRoutes(accessStatus, 'PERSONAL') is identical to the no-context-argument call — explicit PERSONAL is a no-op, never a different code path", () => {
  assert.deepEqual(visibleBottomNavRoutes("FULL", "PERSONAL"), visibleBottomNavRoutes("FULL"));
});

/* ============================== CLUB_MANAGER ============================== */

test("CM-NAV-A: CLUB_MANAGER nav is exactly Главная/Команда/План/Академия, in that order", () => {
  assert.deepEqual(CLUB_MANAGER_NAV_ROUTES.map((r) => r.href), ["/home", "/team", "/plan", "/academy"]);
  assert.deepEqual(CLUB_MANAGER_NAV_ROUTES.map((r) => r.label), ["Главная", "Команда", "План", "Академия"]);
});

test("CM-NAV-B: visibleBottomNavRoutes('FULL', 'CLUB_MANAGER') returns exactly the CLUB_MANAGER set", () => {
  assert.deepEqual(visibleBottomNavRoutes("FULL", "CLUB_MANAGER"), CLUB_MANAGER_NAV_ROUTES);
});

test("CM-NAV-C: CLUB_MANAGER nav has no Metric, no Profile, no Base (Knowledge), no Rating entries", () => {
  const hrefs = CLUB_MANAGER_NAV_ROUTES.map((r) => r.href);
  for (const forbidden of ["/metric", "/profile", "/knowledge", "/ranking"]) {
    assert.equal(hrefs.includes(forbidden), false, `expected ${forbidden} absent from CLUB_MANAGER nav`);
  }
});

test("CM-NAV-D: no CLUB_MANAGER nav item is the raised central Metric slot", () => {
  assert.equal(CLUB_MANAGER_NAV_ROUTES.some((r) => r.central), false);
  assert.equal(CLUB_MANAGER_NAV_ROUTES.length, 4);
});

/* ============================== CITY_MANAGER ============================== */

test("CTM-NAV-A: CITY_MANAGER NOW nav is exactly Главная/Клубы/Вопросы/Академия, in that order", () => {
  assert.deepEqual(CITY_MANAGER_NAV_ROUTES.map((r) => r.href), ["/home", "/city", "/questions", "/academy"]);
  assert.deepEqual(CITY_MANAGER_NAV_ROUTES.map((r) => r.label), ["Главная", "Клубы", "Вопросы", "Академия"]);
});

test("CTM-NAV-B: visibleBottomNavRoutes('FULL', 'CITY_MANAGER') returns exactly the CITY_MANAGER set", () => {
  assert.deepEqual(visibleBottomNavRoutes("FULL", "CITY_MANAGER"), CITY_MANAGER_NAV_ROUTES);
});

test("CTM-NAV-C: CITY_MANAGER nav has no Metric, no Profile, and — section 1's explicit 'do NOT expose Показатели yet' — no Indicators entry; exactly 4 items", () => {
  const hrefs = CITY_MANAGER_NAV_ROUTES.map((r) => r.href);
  const labels = CITY_MANAGER_NAV_ROUTES.map((r) => r.label);
  for (const forbidden of ["/metric", "/profile"]) assert.equal(hrefs.includes(forbidden), false, `expected ${forbidden} absent`);
  assert.equal(labels.some((l) => /показател/i.test(l)), false);
  assert.equal(CITY_MANAGER_NAV_ROUTES.length, 4);
});

test("CTM-NAV-D: 'Клубы' stays active under every existing CITY_MANAGER club sub-screen — sibling routes, not literal sub-paths of /city, require the explicit match[] array", () => {
  const clubsItem = CITY_MANAGER_NAV_ROUTES.find((r) => r.href === "/city")!;
  for (const sibling of ["/city/club", "/city/managers", "/city/training"]) {
    assert.equal(isActiveNavRoute(sibling, clubsItem), true, `expected ${sibling} to keep Клубы active`);
  }
});

test("CTM-NAV-E: 'Вопросы' stays active under its real sub-paths with no explicit match[] needed (prefix rule alone is sufficient)", () => {
  const questionsItem = CITY_MANAGER_NAV_ROUTES.find((r) => r.href === "/questions")!;
  assert.equal(isActiveNavRoute("/questions/abc-123", questionsItem), true);
  assert.equal(isActiveNavRoute("/questions/ask", questionsItem), true);
});

/* ============================== PENDING / access status ============================== */

test("ACCESS-A: PENDING_APPROVAL sees Главная+Академия only, regardless of effectiveContext — accessStatus is checked before context, every time", () => {
  for (const ctx of ["PERSONAL", "CLUB_MANAGER", "CITY_MANAGER"] as const) {
    assert.deepEqual(visibleBottomNavRoutes("PENDING_APPROVAL", ctx).map((r) => r.href), ["/home", "/academy"]);
  }
});

test("ACCESS-B: LIMITED sees Академия only, regardless of effectiveContext", () => {
  for (const ctx of ["PERSONAL", "CLUB_MANAGER", "CITY_MANAGER"] as const) {
    assert.deepEqual(visibleBottomNavRoutes("LIMITED", ctx).map((r) => r.href), ["/academy"]);
  }
});

test("ACCESS-C: a LIMITED/PENDING_APPROVAL actor can never see a management nav set even with a forged/stale CLUB_MANAGER or CITY_MANAGER stored context (section 19)", () => {
  assert.notDeepEqual(visibleBottomNavRoutes("PENDING_APPROVAL", "CLUB_MANAGER"), CLUB_MANAGER_NAV_ROUTES);
  assert.notDeepEqual(visibleBottomNavRoutes("LIMITED", "CITY_MANAGER"), CITY_MANAGER_NAV_ROUTES);
});

test("ACCESS-D: FULL/null/undefined/SUSPENDED accessStatus all defer entirely to effectiveContext (server-side accessStatus enforcement, not the nav, is what actually blocks SUSPENDED elsewhere)", () => {
  for (const status of ["FULL", null, undefined, "SUSPENDED"] as const) {
    assert.deepEqual(visibleBottomNavRoutes(status, "CLUB_MANAGER"), CLUB_MANAGER_NAV_ROUTES);
  }
});

/* ============================== View As ============================== */

test("VIEWAS-A: CITY_MANAGER previewing CLUB_MANAGER (persona substitution) resolves to CLUB_MANAGER nav, overriding their real stored CITY_MANAGER context — section 5's high-priority regression guard", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: "CLUB_MANAGER" }), "CLUB_MANAGER");
});

test("VIEWAS-B: a MANAGER preview (persona substitution) resolves to PERSONAL, overriding any stored management context", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: "MANAGER" }), "PERSONAL");
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CLUB_MANAGER", previewRole: "MANAGER" }), "PERSONAL");
});

test("VIEWAS-C: a CITY_MANAGER self-preview (previewRole='CITY_MANAGER' — NOT persona substitution, see effective-context.ts's isPersonaPreview) does not override — falls through to the real stored context unchanged", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: "CITY_MANAGER" }), "CITY_MANAGER");
});

test("VIEWAS-D: no active preview (previewRole null) simply uses the real stored context", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: "CLUB_MANAGER", previewRole: null }), "CLUB_MANAGER");
  assert.equal(resolveEffectiveNavContext({ storedContextType: "PERSONAL", previewRole: null }), "PERSONAL");
});

/* ============================== context fallback / unsupported ============================== */

test("CONTEXT-A: a missing stored context (fresh session, never visited Home) safely falls back to PERSONAL", () => {
  assert.equal(resolveEffectiveNavContext({ storedContextType: null, previewRole: null }), "PERSONAL");
  assert.equal(resolveEffectiveNavContext({ storedContextType: undefined, previewRole: undefined }), "PERSONAL");
});

test("CONTEXT-B: an unrecognized/unsupported stored context value never exposes a management nav — falls back to PERSONAL (allowlist, not denylist)", () => {
  const ctx = resolveEffectiveNavContext({
    // @ts-expect-error — deliberately outside the known union, simulating a future/unsupported context
    storedContextType: "OPERATIONS_DIRECTOR",
    previewRole: null,
  });
  assert.equal(ctx, "PERSONAL");
});

test("CONTEXT-C: visibleBottomNavRoutes itself defaults any effectiveContext value it doesn't recognize to the PERSONAL set — defense in depth beyond the resolver", () => {
  assert.deepEqual(
    // @ts-expect-error — deliberately outside the declared ManagementNavContext union
    visibleBottomNavRoutes("FULL", "PROJECT_ADMIN"),
    BOTTOM_NAV_ROUTES,
  );
});

/* ============================== isActiveNavRoute (route active-state) ============================== */

test("ISACTIVE-A: exact href match is active", () => {
  assert.equal(isActiveNavRoute("/home", { href: "/home", label: "Главная" }), true);
});

test("ISACTIVE-B: a literal sub-path is active (e.g. /team/employee under /team)", () => {
  assert.equal(isActiveNavRoute("/team/employee", { href: "/team", label: "Команда" }), true);
});

test("ISACTIVE-C: an unrelated path is not active", () => {
  assert.equal(isActiveNavRoute("/academy", { href: "/team", label: "Команда" }), false);
});

test("ISACTIVE-D: an explicit match[] sibling path is active even though it is not a literal sub-path", () => {
  assert.equal(isActiveNavRoute("/city/club", { href: "/city", label: "Клубы", match: ["/city/club"] }), true);
});

test("ISACTIVE-E: a path that merely starts with the same characters but isn't a real sub-path is NOT active (e.g. /teamwork vs /team)", () => {
  assert.equal(isActiveNavRoute("/teamwork", { href: "/team", label: "Команда" }), false);
});

/* ============================== source-text: where the nav does/doesn't render ============================== */

test("ROUTES-A: all four new CLUB_MANAGER/CITY_MANAGER root screens render BottomNavigation", () => {
  for (const file of ["src/app/team/page.tsx", "src/app/plan/page.tsx", "src/app/city/page.tsx", "src/app/questions/page.tsx"]) {
    assert.match(read(file), /<BottomNavigation\s*\/>/, `expected ${file} to render BottomNavigation`);
  }
});

test("ROUTES-B: deep detail routes do NOT render BottomNavigation — focused drill-down screens keep their existing back-header behavior only (section 6)", () => {
  for (const file of [
    "src/app/team/employee/page.tsx",
    "src/app/city/club/page.tsx",
    "src/app/city/managers/page.tsx",
    "src/app/city/training/page.tsx",
    "src/app/questions/[id]/page.tsx",
    "src/app/questions/ask/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /<BottomNavigation/, `expected ${file} to NOT render BottomNavigation`);
  }
});

test("ROUTES-C: PERSONAL's already-nav-bearing screens are untouched this round — still render BottomNavigation unconditionally, same as before", () => {
  for (const file of [
    "src/app/home/page.tsx",
    "src/app/academy/page.tsx",
    "src/app/knowledge/page.tsx",
    "src/app/ranking/page.tsx",
    "src/app/metric/page.tsx",
    "src/app/profile/page.tsx",
  ]) {
    assert.match(read(file), /<BottomNavigation\s*\/>/, `expected ${file} to still render BottomNavigation`);
  }
});

test("ROUTES-D: /metric's route file still exists and was not deleted or converted into something else (section 2 — removed from the management nav, not rewritten)", () => {
  assert.match(read("src/app/metric/page.tsx"), /export default function/);
});

test("ROUTES-E: the four newly-nav-bearing root screens use the same pb-32 bottom padding convention every pre-existing nav-bearing screen already uses (section 17)", () => {
  for (const file of ["src/app/team/page.tsx", "src/app/plan/page.tsx", "src/app/city/page.tsx", "src/app/questions/page.tsx"]) {
    assert.match(read(file), /min-h-\[100dvh\] pb-32/, `expected ${file} to use pb-32`);
  }
});

test("WIRE-A: bottom-navigation.tsx resolves effective context from loadStoredContext (home-context-storage.ts) and the real viewContext.previewRole — no second state system introduced (section 4)", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.match(src, /loadStoredContext\(getOwnerKey\(\)\)/);
  assert.match(src, /user\?\.viewContext\?\.previewRole/);
  assert.match(src, /resolveEffectiveNavContext/);
});

test("WIRE-B: bottom-navigation.tsx imports isActiveNavRoute from nav-items.ts rather than defining its own local copy", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.match(src, /isActiveNavRoute/);
  assert.doesNotMatch(src, /function isActive\(/);
});

/* ============================== Profile is never a nav tab ============================== */

test("PROFILE-A: Profile is not a bottom-nav tab in ANY of the three nav sets — permanent product rule (section 0)", () => {
  for (const set of [BOTTOM_NAV_ROUTES, CLUB_MANAGER_NAV_ROUTES, CITY_MANAGER_NAV_ROUTES]) {
    assert.equal(set.some((r) => r.href === "/profile" || /профил/i.test(r.label)), false);
  }
});

test("PROFILE-B: the new management-primitives.tsx file never references /profile — it does not invent a second Profile entry point", () => {
  assert.doesNotMatch(read("src/components/management/management-primitives.tsx"), /\/profile/);
});

/* ============================== visual system: attention vs neutral (section 10) ============================== */

test("VISUAL-A: AttentionItem uses brand/yellow emphasis (bg-brand/12, text-brand) on its icon — the one place yellow means 'needs action'", () => {
  const src = read("src/components/management/management-primitives.tsx");
  const fnSrc = src.slice(src.indexOf("export function AttentionItem"), src.indexOf("export function AttentionSection"));
  assert.match(fnSrc, /bg-brand\/12/);
  assert.match(fnSrc, /text-brand/);
});

test("VISUAL-B: ManagementListRow uses a neutral icon treatment (bg-muted, text-muted-foreground) — never brand/yellow by default", () => {
  const src = read("src/components/management/management-primitives.tsx");
  const fnSrc = src.slice(src.indexOf("export function ManagementListRow"), src.indexOf("/* ============================== ManagementSummary"));
  assert.match(fnSrc, /bg-muted/);
  assert.doesNotMatch(fnSrc, /bg-brand/);
});

test("VISUAL-C: ManagementSummary renders ONE card wrapping all stats with internal dividers, not N separate cards — the 'visually light, not giant KPI cards' requirement (section 12)", () => {
  const src = read("src/components/management/management-primitives.tsx");
  const fnSrc = src.slice(src.indexOf("export function ManagementSummary"), src.length);
  const glassCardCount = (fnSrc.match(/<GlassCard/g) ?? []).length;
  assert.equal(glassCardCount, 1);
  assert.match(fnSrc, /border-l border-border/);
});

test("VISUAL-D: ManagementEmptyState's default copy matches the exact Russian string the audit found duplicated four times", () => {
  assert.match(read("src/components/management/management-primitives.tsx"), /Сейчас ничего не требует внимания\./);
});

test("VISUAL-E: no existing PERSONAL screen imports the new management primitives — this round does not touch PERSONAL styling (section 3)", () => {
  for (const file of [
    "src/app/home/page.tsx",
    "src/app/academy/page.tsx",
    "src/app/knowledge/page.tsx",
    "src/app/ranking/page.tsx",
    "src/app/metric/page.tsx",
    "src/app/profile/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /management-primitives/);
  }
});

test("VISUAL-F: none of the existing management screens were rewired to use the new primitives yet — built and proven, not migrated (section 8/11's explicit 'do not migrate every screen')", () => {
  for (const file of ["src/app/home/page.tsx", "src/app/team/page.tsx", "src/app/city/page.tsx", "src/app/city/club/page.tsx", "src/app/city/managers/page.tsx"]) {
    assert.doesNotMatch(read(file), /management-primitives/);
  }
});

test("VISUAL-G: no generic 'ManagementHomeSection' wrapper abstraction was created — the audit's own explicit 'do not abstract for its own sake' instruction (the file's own comment explains WHY it's absent, in prose — this checks there is no actual declaration or usage, not that the words never appear)", () => {
  const src = read("src/components/management/management-primitives.tsx");
  assert.doesNotMatch(src, /function ManagementHomeSection|<ManagementHomeSection/);
});

/* ============================== backend/data untouched (section 16) ============================== */

test("BACKEND-A: Round A touched no Prisma schema or migration — this round is presentation only", () => {
  const schema = read("prisma/schema.prisma");
  // Sanity check the schema is the one we expect, unmodified in shape —
  // the real guarantee here is simply that git diff for this round (see
  // the commit itself) never includes prisma/schema.prisma or a new
  // migrations/ directory, which safe-gate's own build+generate step
  // would already fail loudly on if the two had drifted apart.
  assert.match(schema, /model Notification \{/);
  assert.match(schema, /model EmployeeQuestion \{/);
});
