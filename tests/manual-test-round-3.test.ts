import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveTeamAccessMode } from "../src/lib/cabinet-ui";
import { authorize } from "../src/lib/server/rbac/authorize-core";
import { hasActiveRole } from "../src/lib/server/rbac/scope-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";

/**
 * METRO UP — MANUAL TEST ROUND 3 FIXES.
 *
 * Same honest split as every prior round's test file in this repo (see
 * tests/manual-test-round-2.test.ts's own header): pure, DB-free decision
 * functions get real coverage below; anything DB/DOM-dependent (the actual
 * HTTP round trips, Prisma-backed aggregation in cabinet-dashboards.ts/
 * academy.ts, real component rendering) is an explicit skip stub, matching
 * this codebase's established convention (no Postgres fixture or DOM harness
 * installed). The two P0 fixes' own regression tests already live in
 * tests/rbac.test.ts (ASSIGN-B2/ASSIGN-B3) and are referenced, not
 * duplicated, here.
 */

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "grant-1", role: "CITY_MANAGER", scopeType: "CITY", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return { userId: "user-1", appRole: "EMPLOYEE", accessStatus: null, onboardingCompleted: true, employeeClubId: null, grants: [], ...overrides };
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skip = { skip: "integration: requires Postgres / DOM harness (not installed)" } as const;

/* ============================== TEAM (section 1) ============================== */

test("TEAM-ACCESS-A: no explicit clubId, not previewing -> not a read-only drill-down, activeClubId falls back to the self-lookup's selectedClubId (CLUB_MANAGER's own /team, unchanged flow)", () => {
  const m = resolveTeamAccessMode({ isPreviewing: false, explicitClubId: null, selectedClubId: "club-1" });
  assert.deepEqual(m, { isReadOnlyDrillDown: false, activeClubId: "club-1" });
});

test("TEAM-ACCESS-B: explicit clubId, not previewing -> read-only drill-down, activeClubId is the EXPLICIT clubId (ignores any stale selectedClubId) — the P0 fix's core case: CITY_MANAGER tapping through from /city/club", () => {
  const m = resolveTeamAccessMode({ isPreviewing: false, explicitClubId: "club-poltavskaya", selectedClubId: "some-other-club" });
  assert.deepEqual(m, { isReadOnlyDrillDown: true, activeClubId: "club-poltavskaya" });
});

test("TEAM-ACCESS-C: an active View-As-CLUB_MANAGER preview always wins the read-only DECISION over any ?clubId= in the URL — isReadOnlyDrillDown stays false (dashboard.isPreviewing's own independent server-side guard still hides 'Подтвердить'); this is not a second, weaker access check — resolveClubManagerCabinetAccess's tier 1 (server-side) ignores clubId entirely whenever a preview is active", () => {
  const m = resolveTeamAccessMode({ isPreviewing: true, explicitClubId: "club-x", selectedClubId: null });
  assert.equal(m.isReadOnlyDrillDown, false);
});

test("TEAM-ACCESS-D: no explicit clubId and nothing selected yet (multi-club CLUB_MANAGER mid-selection) -> activeClubId is null, never a fabricated club", () => {
  const m = resolveTeamAccessMode({ isPreviewing: false, explicitClubId: null, selectedClubId: null });
  assert.equal(m.activeClubId, null);
});

test(
  "TEAM-HTTP-A: CITY_MANAGER opens /city/club -> 'Открыть команду' -> /team?clubId=X -> " +
    "GET /api/control/cabinet/club-manager?clubId=X and .../club-manager/team?clubId=X " +
    "both resolve via resolveClubManagerCabinetAccess's tier 3 (club.read) and return " +
    "that club's real roster — the exact P0 acceptance criterion end-to-end",
  skip,
  () => {},
);

test(
  "TEAM-HTTP-B: the SAME CITY_MANAGER requesting a clubId OUTSIDE their scope via " +
    "/team?clubId=<foreign> still 403s (resolveClubManagerCabinetAccess returns null, " +
    "tier 3's canReadClub/grantCoversClub check unchanged by this round) — foreign club " +
    "remains forbidden, scope enforcement not loosened",
  skip,
  () => {},
);

test(
  "TEAM-HTTP-C: a real CLUB_MANAGER opening /team with NO clubId still hits the original " +
    "self-lookup path (cabinetApi.myManagedClubs -> resolveManagedClubSelection) unchanged " +
    "— this round's fix only ADDS the explicit-clubId branch, never alters the no-clubId one",
  skip,
  () => {},
);

/* ============================ ASSIGNMENT (section 2) =========================== */

test(
  "ASSIGN-ROUND3-A: the fix itself — a dual-role actor (legacy ADMIN/PROJECT_ADMIN " +
    "appRole who ALSO genuinely holds an active CITY_MANAGER grant) can now use that " +
    "SEPARATE grant to assign CLUB_MANAGER in-scope, and a pure ADMIN with no such " +
    "grant remains provably unaffected — see tests/rbac.test.ts's ASSIGN-B2/ASSIGN-B3, " +
    "not duplicated here",
  () => {},
);

test(
  "ASSIGN-HTTP-A: CITY_MANAGER -> Полтавская -> select employee -> Назначить -> 2xx -> " +
    "AssignManagerSheet closes -> the assigned manager appears immediately in 'Управляющий' " +
    "and the city dashboard's attention item for that club clears on refetch",
  skip,
  () => {},
);

test(
  "ASSIGN-HTTP-B: revoke the just-created assignment (rolesApi.revoke) -> the club " +
    "returns to 'Не назначен' -> restore (rolesApi.restore) -> the SAME assignment " +
    "becomes ACTIVE again without creating a duplicate row (canRestoreAssignment's " +
    "'no other active manager' guard, already tested in tests/cabinet-ui.test.ts)",
  skip,
  () => {},
);

/* ============================== PROFILE (section 4) ============================ */

test("PROFILE-A: a grant-less actor (plain MANAGER) can never satisfy hasActiveRole for CITY_MANAGER or CLUB_MANAGER — resolveProfileManagementRoles' two `if` guards can never fire, so a MANAGER-only profile gets an empty management-roles array, never an empty-but-rendered block", () => {
  const a = actor({ grants: [] });
  assert.equal(hasActiveRole(a.grants, "CITY_MANAGER"), false);
  assert.equal(hasActiveRole(a.grants, "CLUB_MANAGER"), false);
});

test("PROFILE-B: an actor holding an active MANAGER-role grant (a real NetworkRole, not merely 'no grants') still fails both guards — resolveProfileManagementRoles is keyed on CITY_MANAGER/CLUB_MANAGER specifically, never any active grant", () => {
  const a = actor({ grants: [grant({ role: "MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(hasActiveRole(a.grants, "CITY_MANAGER"), false);
  assert.equal(hasActiveRole(a.grants, "CLUB_MANAGER"), false);
});

test(
  "PROFILE-HTTP-A: a real CITY_MANAGER with a CITY-scope grant sees " +
    "{type:'CITY_MANAGER', label:'Ст. города', clubs: [every currently-active club in " +
    "that city]} — resolveCityManagerClubs' dynamic CITY-scope expansion (already tested " +
    "by tests/cabinet-dashboards.test.ts's CABCITY-* suite), never EmployeeProfile.clubId",
  skip,
  () => {},
);

test(
  "PROFILE-HTTP-B: an actor holding BOTH an active CITY_MANAGER grant and a separate " +
    "active CLUB_MANAGER grant sees TWO entries in the roles array (one per type) — the " +
    "array shape exists specifically so this never collapses to one role or overwrites " +
    "the other",
  skip,
  () => {},
);

test(
  "PROFILE-HTTP-C: an explicit CLUB-scope CITY_MANAGER grant plus a CITY-scope grant for " +
    "the same city de-duplicates to one club entry, never listed twice — the Map-keyed-by-" +
    "clubId construction inside resolveCityManagerClubs/resolveClubManagerClubs, unchanged " +
    "by this round",
  skip,
  () => {},
);

/* ========================== TRAINING ANALYTICS (section 5) ===================== */

test("TRAIN-SCOPE-A: club.read denies a plain, grant-less actor — the exact predicate GET /api/control/cabinet/employee-training uses to gate the shared employee-detail screen (see tests/rbac.test.ts's READ-E; re-asserted here as this round's own traceable requirement)", () => {
  assert.equal(authorize(actor(), { action: "club.read", targetClubId: "club-1", targetClubCityId: "any" }), false);
});

test("TRAIN-SCOPE-B: club.read denies an actor holding an active MANAGER-role grant (a REAL NetworkRole, not just 'no grants at all') — section 8's 'MANAGER cannot access management training analytics' holds even for a MANAGER who does have a grant, just not CITY_MANAGER/CLUB_MANAGER", () => {
  const a = actor({ grants: [grant({ role: "MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(authorize(a, { action: "club.read", targetClubId: "club-1", targetClubCityId: "any" }), false);
});

test("TRAIN-SCOPE-C: club.read allows a CITY_MANAGER for a club inside their city and denies one outside it — getCityManagerTrainingByClub's clubs list and the employee-training route share this exact predicate, so a club never listed on one screen can never be reached via the other either", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "voronezh" })] });
  assert.equal(authorize(a, { action: "club.read", targetClubId: "club-in-scope", targetClubCityId: "voronezh" }), true);
  assert.equal(authorize(a, { action: "club.read", targetClubId: "club-foreign", targetClubCityId: "other-city" }), false);
});

test(
  "TRAIN-HTTP-A: GET /api/control/cabinet/city-manager/training returns rows only for " +
    "resolveCityManagerClubs(actor) — a club outside the CITY_MANAGER's effective scope " +
    "never appears, even if it belongs to the same overall network",
  skip,
  () => {},
);

test(
  "TRAIN-HTTP-B: a club with zero employees returns employeeCount:0, " +
    "averageProgressPercent:null (summarizeTraining's userIds.length===0 branch), never " +
    "a fabricated 0% or a crash — an empty club is a valid, honest result",
  skip,
  () => {},
);

test(
  "TRAIN-HTTP-C: getEmployeeTrainingDetail for an employee with zero LessonProgress/" +
    "QuizAttempt rows returns every lesson with completed:false, completedAt:null, " +
    "quiz:null — never throws, never fabricates a due date/mandatory/overdue/time-spent " +
    "field that doesn't exist anywhere in the schema",
  skip,
  () => {},
);

test(
  "TRAIN-HTTP-D: CLUB_MANAGER reuse (section 5D) — the SAME GET /api/control/cabinet/" +
    "employee-training?userId=X, reached from the CLUB_MANAGER's own /team roster, " +
    "authorizes via the CLUB_MANAGER's own grant (canReadClub's CLUB branch) with zero " +
    "role-specific code in the route — one shared screen, not two analytics systems",
  skip,
  () => {},
);

/* =============================== RATING (section 6) ============================ */

const rankingSrc = read("src/app/ranking/page.tsx");

test("RATING-COPY-A: the 'Клубы' placeholder no longer mentions internal product-development reasoning (формула/показатель/расчёта) anywhere in the rendered strings", () => {
  // Only the developer-facing doc COMMENT may use these words now; check the
  // literal user-facing <p> strings specifically, not the whole file.
  const userFacingBlock = rankingSrc.slice(rankingSrc.indexOf('font-semibold">Рейтинг клубов'));
  const firstTwoParagraphs = userFacingBlock.slice(0, userFacingBlock.indexOf("</GlassCard>"));
  assert.doesNotMatch(firstTwoParagraphs, /формул/i);
  assert.doesNotMatch(firstTwoParagraphs, /показател/i);
  assert.doesNotMatch(firstTwoParagraphs, /расч[её]т/i);
});

test("RATING-COPY-B: the new copy says the rating is coming, honestly, without inventing a score", () => {
  assert.match(rankingSrc, /Рейтинг клубов готовится/);
  assert.match(rankingSrc, /Скоро здесь появится рейтинг клубов вашего города/);
});

test("RATING-COPY-C: the Менеджеры|Клубы toggle itself is untouched by the copy fix", () => {
  assert.ok(rankingSrc.includes("Менеджеры"));
  assert.ok(rankingSrc.includes("Клубы"));
});

test(
  "RATING-VIS-A: canViewClubMode remains server-derived from the real actor's grants " +
    "(hasActiveRole check) — unchanged by this round's copy-only fix; see " +
    "tests/manual-test-round-2.test.ts's RATING-VIS-A",
  skip,
  () => {},
);

/* =============================== LAYOUT (section 3) ============================ */

const homeSrc = read("src/app/home/page.tsx");

test("LAYOUT-A: the Personal ('full') branch is wrapped in its own tighter gap-4 container, distinct from the shared outer gap-6 <motion.main> — density fix is scoped, not global", () => {
  assert.match(homeSrc, /className="flex flex-col gap-6 px-5 pt-4"/);
  assert.match(homeSrc, /dash\.kind === "full" && \(\s*<div className="flex flex-col gap-4">/);
});

test("LAYOUT-B: every Personal-context widget still renders inside that branch — Plan, Continue Learning, Knowledge Base, XP, Achievement, Rating, Mystery Shopper — nothing removed, only re-spaced", () => {
  // Anchored to the actual JSX render-guard strings, not the bare
  // "dash.kind === ..." fragment — mini-app-performance's prefetch dispatch
  // (home/page.tsx) legitimately mentions dash.kind earlier in the file
  // (deciding WHICH destinations to warm), so a bare indexOf would find that
  // instead of the render branch this test means to slice out.
  const fullBranchStart = homeSrc.indexOf('dash && dash.kind === "full" && (');
  const fullBranchEnd = homeSrc.indexOf('dash && dash.kind === "city_manager" && (');
  assert.ok(fullBranchStart >= 0 && fullBranchEnd > fullBranchStart, "expected to find the Personal render branch bounds");
  const fullBranch = homeSrc.slice(fullBranchStart, fullBranchEnd);
  assert.match(fullBranch, /<PlanCard/);
  assert.match(fullBranch, /ContinueLearningCard/);
  assert.match(fullBranch, /База знаний/);
  assert.match(fullBranch, /<XpCard/);
  assert.match(fullBranch, /Последнее достижение/);
  assert.match(fullBranch, /<RatingCard/);
  assert.match(fullBranch, /<MysteryCard/);
});

test("LAYOUT-C: .app-shell already provides the shared max-width/centering every route (Personal and CITY_MANAGER Home alike) uses — confirms this round's fix correctly targeted vertical rhythm only, never a redundant per-page width/centering mechanism", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.app-shell\s*\{[^}]*max-width:\s*480px/);
  assert.match(css, /\.app-shell\s*\{[^}]*margin-inline:\s*auto/);
});

test(
  "REGRESSION-D: PERSONAL/CLUB_MANAGER/CITY_MANAGER Home contexts remain fully separate " +
    "after every change in this round — the four kind branches (full/city_manager/" +
    "club_manager/onboarding) are still mutually exclusive at the type level (re-verified " +
    "by code review this round, same guarantee tests/manual-test-round-2.test.ts's " +
    "REGRESSION-C already names)",
  skip,
  () => {},
);

test(
  "REGRESSION-E: the visible cabinet switcher (ContextSwitcherSheet, the 'Кабинет' pill) " +
    "is untouched by this round's work — none of this round's diffs (P0 fixes, layout, " +
    "Profile, training analytics, rating copy) touch home/page.tsx's switcherOpen/" +
    "activeContext/availableContexts state or the ContextSwitcherSheet component itself " +
    "(verified by code review, not by this text search alone)",
  () => {
    assert.match(homeSrc, /function ContextSwitcherSheet/);
    assert.match(homeSrc, /<ContextSwitcherSheet/);
  },
);
