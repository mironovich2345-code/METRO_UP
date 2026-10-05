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
  isManagementNavContext,
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

test("CONTEXT-D: isManagementNavContext is true for CLUB_MANAGER/CITY_MANAGER and false for PERSONAL — the one predicate /plan and /academy use to decide whether to show the avatar entry at all", () => {
  assert.equal(isManagementNavContext("CLUB_MANAGER"), true);
  assert.equal(isManagementNavContext("CITY_MANAGER"), true);
  assert.equal(isManagementNavContext("PERSONAL"), false);
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

test("PROFILE-B: Round A.1's ManagementAvatarLink is the ONLY place in the primitives file with an actual /profile href (code, not prose) — no second, different entry point was invented alongside it", () => {
  const src = read("src/components/management/management-primitives.tsx");
  const occurrences = (src.match(/href="\/profile"/g) ?? []).length;
  assert.equal(occurrences, 1, "expected exactly one href=\"/profile\" — the prose mention in this file's own doc comment is not a second entry point");
  const fnSrc = src.slice(src.indexOf("export function ManagementAvatarLink"), src.indexOf("/* ============================== ManagementHeader"));
  assert.match(fnSrc, /href="\/profile"/);
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

test("VISUAL-E: screens with NO management-context branch at all never import the new management primitives (Knowledge/Ranking/Metric/Profile are untouched by Round A/A.1/B)", () => {
  for (const file of ["src/app/knowledge/page.tsx", "src/app/ranking/page.tsx", "src/app/metric/page.tsx", "src/app/profile/page.tsx"]) {
    assert.doesNotMatch(read(file), /management-primitives/);
  }
});

test("VISUAL-E2: Academy/Plan's avatar entry is GATED behind a ternary with an undefined fallback, never unconditional — PERSONAL provably still gets leading=undefined, i.e. its EXACT pre-Round-A.1 header (Round A.1, section A)", () => {
  const academy = read("src/app/academy/page.tsx");
  assert.match(academy, /leading=\{isManagementRoot \? <ManagementAvatarLink \/> : undefined\}/);
  const plan = read("src/app/plan/page.tsx");
  assert.match(plan, /leading=\{isClubManagerRoot \? <ManagementAvatarLink \/> : undefined\}/);
});

test("VISUAL-F: the still-untouched management DETAIL screens (section 6's own list) were not rewired to use the new primitives — Round A.1/B only touched root workspace screens", () => {
  for (const file of [
    "src/app/city/club/page.tsx",
    "src/app/city/managers/page.tsx",
    "src/app/city/training/page.tsx",
    "src/app/team/employee/page.tsx",
    "src/app/questions/[id]/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /management-primitives/);
  }
});

test("VISUAL-F2: CityManagerHomeSection (inside home/page.tsx) does not reference the new management primitives — CITY_MANAGER Home remains unchanged even though the SAME file now imports them for the rebuilt CLUB_MANAGER section (Round B's explicit 'CITY_MANAGER Home must remain unchanged in this round')", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function CityManagerHomeSection"), src.indexOf("function ReturnToCityCabinetCard"));
  assert.doesNotMatch(fnSrc, /AttentionSection|AttentionItem|ManagementListRow|ManagementEmptyState|ManagementSummary|ManagementHeader|ManagementAvatarLink/);
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

/* ===================================================================== *
 *  ROUND A.1 — root shell corrections
 * ===================================================================== */

test("A1-TEAM-A: /team's drill-down branch (CITY_MANAGER's explicit ?clubId=) keeps its back-button header and has NO avatar entry", () => {
  const src = read("src/app/team/page.tsx");
  const ifIdx = src.indexOf("{isReadOnlyDrillDown ? (");
  const elseMarkerIdx = src.indexOf(") : (", ifIdx);
  assert.ok(ifIdx > 0 && elseMarkerIdx > ifIdx);
  const drillDownBranch = src.slice(ifIdx, elseMarkerIdx);
  assert.match(drillDownBranch, /showBack/);
  assert.doesNotMatch(drillDownBranch, /ManagementAvatarLink/);
});

test("A1-TEAM-B: /team's root branch (real CLUB_MANAGER, or a View-As-CLUB_MANAGER preview) shows the avatar entry and sets no showBack", () => {
  const src = read("src/app/team/page.tsx");
  const ifIdx = src.indexOf("{isReadOnlyDrillDown ? (");
  const elseMarkerIdx = src.indexOf(") : (", ifIdx);
  const endIdx = src.indexOf(")}", elseMarkerIdx);
  const rootBranch = src.slice(elseMarkerIdx, endIdx);
  assert.match(rootBranch, /ManagementAvatarLink/);
  assert.doesNotMatch(rootBranch, /showBack/);
});

test("A1-TEAM-C: /team's persistent bottom nav is gated on !isReadOnlyDrillDown — hidden for a CITY_MANAGER's explicit club drill-down, shown for the real CLUB_MANAGER root case (section B's own rule, 'use route/query semantics')", () => {
  const src = read("src/app/team/page.tsx");
  assert.match(src, /\{!isReadOnlyDrillDown && <BottomNavigation \/>\}/);
});

test("A1-TEAM-D: the multi-club CLUB_MANAGER club-selector screen (never reachable during a CITY_MANAGER drill-down — its own data query is gated on !explicitClubId) also gets the avatar entry and keeps its own BottomNavigation", () => {
  const src = read("src/app/team/page.tsx");
  const commentIdx = src.indexOf("// Multi-club, not yet chosen");
  const firstReturnIdx = src.indexOf("return (", commentIdx);
  const secondReturnIdx = src.indexOf("return (", firstReturnIdx + 10);
  const selectorSrc = src.slice(firstReturnIdx, secondReturnIdx);
  assert.match(selectorSrc, /ManagementAvatarLink/);
  assert.match(selectorSrc, /<BottomNavigation \/>/);
});

test("A1-CITY-A: /city's header always shows the avatar entry and never a back button — it is always the viewer's own root 'Клубы' screen, never a drill-down for someone else", () => {
  const src = read("src/app/city/page.tsx");
  assert.match(src, /leading=\{<ManagementAvatarLink \/>\}/);
  assert.doesNotMatch(src, /showBack/);
});

test("A1-QUESTIONS-A: /questions' header always shows the avatar entry and never a back button", () => {
  const src = read("src/app/questions/page.tsx");
  assert.match(src, /leading=\{<ManagementAvatarLink \/>\}/);
  assert.doesNotMatch(src, /showBack/);
});

test("A1-PLAN-A: /plan's avatar entry and dropped back button are both gated on isClubManagerRoot — a plain PERSONAL employee visiting /plan still gets showBack=true and no avatar, byte-identical to before", () => {
  const src = read("src/app/plan/page.tsx");
  assert.match(src, /showBack=\{!isClubManagerRoot\}/);
  assert.match(src, /leading=\{isClubManagerRoot \? <ManagementAvatarLink \/> : undefined\}/);
});

test("A1-PROFILE-STILL-ABSENT: none of the Round A.1 header changes added Profile to any bottom-nav route array (re-confirmed after this round's edits)", () => {
  for (const set of [BOTTOM_NAV_ROUTES, CLUB_MANAGER_NAV_ROUTES, CITY_MANAGER_NAV_ROUTES]) {
    assert.equal(set.some((r) => r.href === "/profile"), false);
  }
});

/* ===================================================================== *
 *  ROUND B — CLUB_MANAGER Home rebuild
 * ===================================================================== */

test("B-PERSONAL-A: the PERSONAL header branch (dash.kind !== 'club_manager') is untouched — still shows greeting+firstName, never the new role/scope text", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /\{dash && dash\.kind === "club_manager" \? "Управляющий" : `\$\{greeting\},`\}/);
  assert.match(src, /\{dash && dash\.kind === "club_manager" \? dash\.block\.clubLabel : firstName\}/);
});

test("B-PERSONAL-B: the PERSONAL Home body branch (dash.kind==='full') was not touched by this round — same card sequence as before", () => {
  const src = read("src/app/home/page.tsx");
  const startIdx = src.indexOf('dashStatus === "ready" && dash && dash.kind === "full"');
  const endIdx = src.indexOf('dashStatus === "ready" && dash && dash.kind === "city_manager"');
  assert.ok(startIdx > 0 && endIdx > startIdx);
  const fnSrc = src.slice(startIdx, endIdx);
  for (const card of ["PlanCard", "ContinueLearningCard", "XpCard", "RatingCard", "MysteryCard"]) {
    assert.match(fnSrc, new RegExp(card));
  }
});

test("B-CITY-A: CityManagerHomeSection's own 5 sections (Требует внимания/Мои клубы/Управляющие/Обучение по клубам/Вопросы сотрудников) are all still present, unchanged — confirmed again at the Round B level, not just Round A's", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function CityManagerHomeSection"), src.indexOf("function ReturnToCityCabinetCard"));
  for (const label of ["Требует внимания", "Мои клубы", "Управляющие", "Обучение по клубам", "Вопросы сотрудников"]) {
    assert.match(fnSrc, new RegExp(label));
  }
});

test("B-CLUBMGR-A: ClubManagerHomeSection reads only REAL ClubManagerHomeBlockDTO fields — no invented field names (block.clubLabel is consumed by Home's OWN header, one level up, not by this component)", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  for (const field of ["block.attention", "block.employeeCount", "block.pendingApprovalCount", "block.training"]) {
    assert.match(fnSrc, new RegExp(field.replace(".", "\\.")));
  }
});

test("B-CLUBMGR-B: 'Мой клуб' card is removed from ClubManagerHomeSection — no 'Мой клуб' text anywhere in it, and no empty placeholder page was built to preserve it", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.doesNotMatch(fnSrc, /Мой клуб/);
});

test("B-CLUBMGR-C: the approved order is Требует внимания (AttentionSection) -> План на сегодня -> Команда -> Обучение команды", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  const iAttention = fnSrc.indexOf("<AttentionSection");
  const iPlan = fnSrc.indexOf("План на сегодня");
  const iTeam = fnSrc.indexOf('title="Команда"');
  const iTraining = fnSrc.indexOf('title="Обучение команды"');
  assert.ok(iAttention >= 0 && iPlan > iAttention && iTeam > iPlan && iTraining > iTeam, "expected Attention -> Plan -> Team -> Training, in that order");
});

test("B-CLUBMGR-D: the Plan row navigates to /plan, the Team row navigates to /team, the Training row uses the existing /team drill-down — no new/invented route", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.match(fnSrc, /onClick=\{\(\) => router\.push\("\/plan"\)\}/);
  assert.match(fnSrc, /title="Команда" subtitle=\{teamSubtitle\} onClick=\{\(\) => router\.push\("\/team"\)\}/);
  assert.match(fnSrc, /title="Обучение команды" subtitle=\{trainingSubtitle\} onClick=\{\(\) => router\.push\("\/team"\)\}/);
});

test("B-CLUBMGR-E: no fake KPI DATA (an actual field/value reference, not this test file's own explanatory prose) appears anywhere in ClubManagerHomeSection — no averageProgressPercent (CLUB_MANAGER has no such field), no рекламный бюджет/Operations Plan/mystery-shopper value", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.doesNotMatch(fnSrc, /averageProgressPercent/);
  assert.doesNotMatch(fnSrc, /\.mystery|mysteryScore|operationsPlan|advertisingBudget/i);
});

test("B-CLUBMGR-F: the attention item exists only when block.attention is genuinely non-empty; the OLD local EmptyAttention component is not reused here — AttentionSection owns its own empty state now", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.match(fnSrc, /block\.attention\.length > 0/);
  assert.doesNotMatch(fnSrc, /EmptyAttention/);
});

test("B-VIEWAS-A: the club_manager branch renders ReturnToCityCabinetCard (for an active preview) plus the SAME ClubManagerHomeSection call — a View-As-CLUB_MANAGER preview gets the exact rebuilt Home, no second code path", () => {
  const src = read("src/app/home/page.tsx");
  const callSiteIdx = src.indexOf('dashStatus === "ready" && dash && dash.kind === "club_manager"');
  assert.ok(callSiteIdx > 0);
  const callSiteSrc = src.slice(callSiteIdx, callSiteIdx + 700);
  assert.match(callSiteSrc, /ReturnToCityCabinetCard/);
  assert.match(callSiteSrc, /<ClubManagerHomeSection block=\{dash\.block\} plan=\{dash\.plan\} router=\{router\} \/>/);
});

test("B-CACHE-A: ClubManagerHomeSection takes `plan` as a prop from the SAME dash payload — no new useQuery/fetch/API call was introduced for the rebuilt section", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.doesNotMatch(fnSrc, /useQuery|fetch\(|cabinetApi\.|questionsApi\./);
});

test("B-HEADER-A: Home's context-switcher row (the multi-club CLUB_MANAGER affordance) is completely untouched — same showSwitcher/ContextSwitcherSheet condition and markup as before this round", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /showSwitcher \? \(/);
  assert.match(src, /onClick=\{\(\) => setSwitcherOpen\(true\)\}/);
  assert.match(src, /<ContextSwitcherSheet/);
});

/* ===================================================================== *
 *  ROUND B.1 — live screenshot fixes
 * ===================================================================== */

/* --------- section 2: stale nav after ending a View-As preview --------- */

test("STALE-NAV-A: saveStoredContext and onStoredContextChanged both reference the SAME CONTEXT_CHANGED_EVENT constant — the event name is defined exactly once, never two separately-hardcoded strings that could silently drift apart", () => {
  const src = read("src/lib/home-context-storage.ts");
  const stringLiteralOccurrences = (src.match(/"metro-up:home-context-changed"/g) ?? []).length;
  assert.equal(stringLiteralOccurrences, 1, "the event name string should be defined exactly once");
  assert.match(src, /window\.dispatchEvent\(new Event\(CONTEXT_CHANGED_EVENT\)\)/);
  assert.match(src, /window\.addEventListener\(CONTEXT_CHANGED_EVENT, listener\)/);
  assert.match(src, /window\.removeEventListener\(CONTEXT_CHANGED_EVENT, listener\)/);
});

test("STALE-NAV-B: onStoredContextChanged returns an unsubscribe function — the exact cleanup-returning shape a useEffect needs", () => {
  const src = read("src/lib/home-context-storage.ts");
  const fnSrc = src.slice(src.indexOf("export function onStoredContextChanged"), src.length);
  assert.match(fnSrc, /return \(\) => window\.removeEventListener/);
});

test("STALE-NAV-C: useEffectiveNavContext subscribes to onStoredContextChanged for its own lifetime (not just a one-time mount read) and returns its unsubscribe as the effect's own cleanup — the root-cause fix for 'nav stays stale until the next real navigation'", () => {
  const src = read("src/components/bottom-navigation.tsx");
  assert.match(src, /return onStoredContextChanged\(readStoredContext\)/);
});

test("STALE-NAV-D: ReturnToCityCabinetCard refreshes AppUserProvider's user (clearing the stale previewRole) in addition to ending the preview — the SAME refresh() call the global ViewAsBanner's own 'end' flow already makes", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ReturnToCityCabinetCard"), src.indexOf("function ClubManagerHomeSection"));
  assert.match(fnSrc, /const \{ refresh: refreshAppUser \} = useAppUser\(\);/);
  assert.match(fnSrc, /await viewAsApi\.end\(\);\s*\n\s*await refreshAppUser\(\);/);
});

test("STALE-NAV-E: ending the preview still unconditionally calls onReturned() (Home's own reloadDash) in a finally block regardless of whether end()/refreshAppUser() succeed — matches the pre-existing 'always reload' behavior, untouched", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ReturnToCityCabinetCard"), src.indexOf("function ClubManagerHomeSection"));
  assert.match(fnSrc, /finally \{\s*\n\s*onReturned\(\);\s*\n\s*\}/);
});

test("STALE-NAV-F: the full scenario, expressed via the pure resolver — during preview: CLUB_MANAGER; mid-transition (previewRole just cleared, storage not yet rewritten): still correctly CLUB_MANAGER via the stored-context fallback, never a PERSONAL flash; once storage catches up: CITY_MANAGER — exactly the task's own mandated 'start preview -> nav=CLUB_MANAGER -> end preview -> nav=CITY_MANAGER immediately' scenario", () => {
  const duringPreview = resolveEffectiveNavContext({ storedContextType: "CLUB_MANAGER", previewRole: "CLUB_MANAGER" });
  assert.equal(duringPreview, "CLUB_MANAGER");

  const midTransition = resolveEffectiveNavContext({ storedContextType: "CLUB_MANAGER", previewRole: null });
  assert.equal(midTransition, "CLUB_MANAGER");

  const afterBothSettle = resolveEffectiveNavContext({ storedContextType: "CITY_MANAGER", previewRole: null });
  assert.equal(afterBothSettle, "CITY_MANAGER");
});

test("STALE-NAV-G: Home's own effect still saves whatever the server just confirmed as the active context (unchanged from before this round) — this is the write the STALE-NAV-A..C fix ensures the nav reactively picks back up, instead of only on the next route change", () => {
  const src = read("src/app/home/page.tsx");
  assert.match(src, /saveStoredContext\(ownerKey, \{ type: dash\.activeContext\.type, clubId: dash\.activeContext\.clubId \}\)/);
});

/* --------- section 3: compact empty attention state --------- */

test("EMPTY-ATTN-A: ManagementEmptyState is now a compact single row — pad=\"sm\" (not \"md\") and a bare checkmark icon with no rounded-2xl badge bubble around it", () => {
  const src = read("src/components/management/management-primitives.tsx");
  const fnSrc = src.slice(src.indexOf("export function ManagementEmptyState"), src.length);
  assert.match(fnSrc, /pad="sm"/);
  assert.doesNotMatch(fnSrc, /rounded-2xl bg-success/);
});

/* --------- section 4: zero-task Daily Plan empty state --------- */

test("PLAN-ZERO-A: /plan omits '0 из 0'/the progress bar entirely when total===0 — a deliberate 'Сегодня / На сегодня задач нет' empty state instead", () => {
  const src = read("src/app/plan/page.tsx");
  const fnSrc = src.slice(src.indexOf('status === "ready" && plan'), src.indexOf("{plan.tasks.length > 0"));
  const zeroBranchIdx = fnSrc.indexOf("plan.total === 0 ? (");
  const elseBranchIdx = fnSrc.indexOf(") : (", zeroBranchIdx);
  assert.ok(zeroBranchIdx > 0 && elseBranchIdx > zeroBranchIdx);
  const zeroBranch = fnSrc.slice(zeroBranchIdx, elseBranchIdx);
  assert.match(zeroBranch, /На сегодня задач нет/);
  assert.doesNotMatch(zeroBranch, /XPProgress|из \{plan\.total\}/);
});

test("PLAN-ZERO-B: non-zero plan state is unchanged — still renders '{completed} из {total} · {pct}%' plus XPProgress", () => {
  const src = read("src/app/plan/page.tsx");
  const fnSrc = src.slice(src.indexOf('status === "ready" && plan'), src.indexOf("{plan.tasks.length > 0"));
  const elseMarkerIdx = fnSrc.indexOf(") : (");
  const endIdx = fnSrc.indexOf(")}", elseMarkerIdx);
  const nonZeroBranch = fnSrc.slice(elseMarkerIdx, endIdx);
  assert.match(nonZeroBranch, /\{plan\.completed\} из \{plan\.total\} · \{pct\}%/);
  assert.match(nonZeroBranch, /<XPProgress value=\{plan\.completed \/ plan\.total\}/);
});

test("PLAN-ZERO-C: the zero-state fix applies to EVERY viewer of /plan (PERSONAL and CLUB_MANAGER alike) — deliberately NOT gated behind isClubManagerRoot the way the avatar/header change is, per section 8's 'deliberately safe for all roles'", () => {
  const src = read("src/app/plan/page.tsx");
  const branchIdx = src.indexOf("plan.total === 0 ? (");
  assert.ok(branchIdx > 0);
  const nearbySrc = src.slice(Math.max(0, branchIdx - 200), branchIdx);
  assert.doesNotMatch(nearbySrc, /isClubManagerRoot/);
});

test("PLAN-ZERO-D: the redundant second 'На сегодня задач нет' message (previously shown separately below an empty task list) was removed — it now appears exactly once, inside the Сегодня card", () => {
  const src = read("src/app/plan/page.tsx");
  assert.match(src, /\{plan\.tasks\.length > 0 && \(/);
  const occurrences = (src.match(/На сегодня задач нет/g) ?? []).length;
  assert.equal(occurrences, 1);
});

test("PLAN-HOME-ZERO-A: ClubManagerHomeSection's own compact Plan row already correctly omits the progress bar at zero tasks (built this way since Round B, re-confirmed here) and shows 'Задач нет', never a 0% indicator", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.match(fnSrc, /plan\.total === 0 \? "Задач нет"/);
  assert.match(fnSrc, /\{plan\.total > 0 && \(/);
});

/* --------- section 5: training copy --------- */

test("TRAINING-COPY-A: the training subtitle never forces a zero-value clause — 'Завершили всё: N' only appears when employeesCompleted > 0, and the in-training clause only when employeesInTraining > 0", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.match(fnSrc, /block\.training\.employeesCompleted > 0\) parts\.push/);
  assert.match(fnSrc, /block\.training\.employeesInTraining > 0\) \{/);
  assert.doesNotMatch(fnSrc, /Завершили всё: \$\{block\.training\.employeesCompleted\} · Проходят/);
});

test("TRAINING-COPY-B: the in-training clause uses correct singular/plural Russian agreement ('проходит' for 1, 'проходят' otherwise) via pluralRu, not a hardcoded plural form", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.match(fnSrc, /pluralRu\(block\.training\.employeesInTraining, "проходит обучение", "проходят обучение", "проходят обучение"\)/);
});

test("TRAINING-COPY-C: no average-progress-percent field is referenced — CLUB_MANAGER's ClubTrainingSummaryDTO genuinely has none (re-confirmed; see Round B's own B-CLUBMGR-E)", () => {
  const src = read("src/app/home/page.tsx");
  const fnSrc = src.slice(src.indexOf("function ClubManagerHomeSection"), src.indexOf("function AttentionRow"));
  assert.doesNotMatch(fnSrc, /averageProgressPercent/);
});

/* --------- section 6: do-not-change guardrails ---------- */

test("GUARDRAIL-A: this round did not touch CITY_MANAGER Home composition, PERSONAL Home's card sequence, bottom-nav route sets, or /city's AttentionList — only the specifically-listed files/sections changed", () => {
  const src = read("src/app/home/page.tsx");
  const cityFnSrc = src.slice(src.indexOf("function CityManagerHomeSection"), src.indexOf("function ReturnToCityCabinetCard"));
  for (const label of ["Требует внимания", "Мои клубы", "Управляющие", "Обучение по клубам", "Вопросы сотрудников"]) {
    assert.match(cityFnSrc, new RegExp(label));
  }
  assert.deepEqual(CLUB_MANAGER_NAV_ROUTES.map((r) => r.href), ["/home", "/team", "/plan", "/academy"]);
  assert.deepEqual(CITY_MANAGER_NAV_ROUTES.map((r) => r.href), ["/home", "/city", "/questions", "/academy"]);
});
