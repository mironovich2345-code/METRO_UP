import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoleLabel } from "../src/lib/cabinet-ui";
import { visibleBottomNavRoutes } from "../src/lib/nav-items";
import type { CityManagerHomeBlockDTO, ClubManagerHomeBlockDTO } from "../src/lib/api/home-types";

/**
 * Sprint: mini-app-role-experience — "MINI APP ROLE EXPERIENCE REFACTOR".
 * CITY_MANAGER/CLUB_MANAGER move from the desktop /control cabinets into the
 * Mini App itself (role-aware Home + /team, /city, /city/managers,
 * /city/club drill-downs); PENDING_APPROVAL gets a real, narrowed Home
 * instead of a full-screen block.
 *
 * Same honest split as every prior sprint's test file in this repo: pure,
 * DB-free decision functions (formatRoleLabel, visibleBottomNavRoutes) are
 * exercised for real below. Everything that touches Postgres
 * (resolveManagementHomeBlock's CITY_MANAGER/CLUB_MANAGER precedence and its
 * View-As branching, isAcademyContentAllowed/resolveOnboardingProgramId,
 * getOnboardingHomeDashboard, the new /team + /city* screens' fetch/render
 * behavior) is an explicit skip stub — this repo's test runner has no
 * Postgres fixture or DOM harness (see tests/cabinet-ui.test.ts's own header
 * comment for the same, already-established limitation).
 */

/* ------------------------------ formatRoleLabel ----------------------------- */

function cityBlock(overrides: Partial<CityManagerHomeBlockDTO> = {}): CityManagerHomeBlockDTO {
  return {
    role: "CITY_MANAGER",
    scopeLabel: "Нижний Новгород",
    clubCount: 3,
    employeeCount: 40,
    clubManagerCount: 2,
    pendingApprovalCount: 1,
    attention: [],
    clubs: [],
    training: null,
    ...overrides,
  };
}

function clubBlock(overrides: Partial<ClubManagerHomeBlockDTO> = {}): ClubManagerHomeBlockDTO {
  return {
    role: "CLUB_MANAGER",
    clubId: "club-1",
    clubLabel: "Коминтерна",
    employeeCount: 12,
    pendingApprovalCount: 0,
    attention: [],
    training: null,
    managedClubCount: 1,
    isPreviewing: false,
    ...overrides,
  };
}

test("ROLELABEL-A: null block (plain MANAGER, or a View-As-MANAGER preview) -> null, never a fabricated label", () => {
  assert.equal(formatRoleLabel(null), null);
});

test("ROLELABEL-B: CITY_MANAGER block -> 'Ст. города · <scopeLabel>' using the exact Russian word already established elsewhere (ViewAsBanner.tsx/effective-context.ts), never a raw enum", () => {
  assert.equal(formatRoleLabel(cityBlock({ scopeLabel: "Нижний Новгород" })), "Ст. города · Нижний Новгород");
});

test("ROLELABEL-C: CITY_MANAGER block with a multi-city scopeLabel is passed through unchanged — section 11's 'never assume one city' extends to the label", () => {
  assert.equal(formatRoleLabel(cityBlock({ scopeLabel: "Города: Воронеж, Казань" })), "Ст. города · Города: Воронеж, Казань");
});

test("ROLELABEL-D: CLUB_MANAGER block -> 'Управляющий · <clubLabel>'", () => {
  assert.equal(formatRoleLabel(clubBlock({ clubLabel: "Коминтерна" })), "Управляющий · Коминтерна");
});

test("ROLELABEL-E: CLUB_MANAGER block during an active View-As preview still formats the same way (isPreviewing only controls mutation visibility elsewhere, never the label text)", () => {
  assert.equal(formatRoleLabel(clubBlock({ clubLabel: "Коминтерна", isPreviewing: true })), "Управляющий · Коминтерна");
});

test("ROLELABEL-F: a multi-club CLUB_MANAGER block (clubId null, section 6's 'never guess one club') still formats from clubLabel's own neutral text", () => {
  assert.equal(formatRoleLabel(clubBlock({ clubId: null, clubLabel: "3 клубами", employeeCount: null, pendingApprovalCount: null })), "Управляющий · 3 клубами");
});

/* ------------------------- visibleBottomNavRoutes (PENDING_APPROVAL) -------- */
/* Covered in full by tests/product-navigation.test.ts's N/N2 — not duplicated
 * here; this file owns the new role-experience-specific pure logic only. */
test("NAV-CROSSCHECK: PENDING_APPROVAL's nav is a strict subset of the full bar (no route invented that isn't also a real bottom-nav entry)", () => {
  const pending = visibleBottomNavRoutes("PENDING_APPROVAL").map((r) => r.href);
  const full = visibleBottomNavRoutes("FULL").map((r) => r.href);
  for (const href of pending) assert.ok(full.includes(href), `${href} must be a real nav route`);
});

/* ============================ Integration scenarios ========================= */
/*
 * DB/DOM-dependent — explicit skip stubs, per this repo's established
 * convention (see cabinet-ui.test.ts / cabinet-dashboards.test.ts headers).
 */
const skip = { skip: "integration: requires Postgres / DOM harness (not installed)" } as const;

test(
  "MGMT-A: resolveManagementHomeBlock precedence for a real actor with no active " +
    "View-As preview — CITY_MANAGER grant wins over CLUB_MANAGER when both are " +
    "held (section 5's stated precedence); a plain MANAGER with neither gets null",
  skip,
  () => {},
);

test(
  "MGMT-B: resolveManagementHomeBlock during an active View-As-CLUB_MANAGER " +
    "preview always returns that previewed club's block with isPreviewing:true, " +
    "regardless of what the real actor's own grants would otherwise resolve to " +
    "(the preview overrides, per section 7)",
  skip,
  () => {},
);

test(
  "MGMT-C: resolveManagementHomeBlock during an active View-As-MANAGER preview " +
    "returns null unconditionally — 'normal employee experience' (section 18), " +
    "even if the real actor is a CITY_MANAGER/CLUB_MANAGER",
  skip,
  () => {},
);

test(
  "MGMT-D: a real CLUB_MANAGER managing more than one club gets clubId:null + " +
    "a neutral managedClubCount summary — never an arbitrarily picked first club " +
    "(section 6); the real selection happens on /team",
  skip,
  () => {},
);

test(
  "MGMT-E: resolveManagementHomeBlock never calls getPlanTodayFor/materializes " +
    "Daily Plan rows for the acting CLUB_MANAGER or CITY_MANAGER — it reuses " +
    "loadEmployees directly, not getClubManagerDashboard, specifically to avoid " +
    "that side effect (see cabinet-dashboards.ts's own comment)",
  skip,
  () => {},
);

test(
  "ONBOARD-A: isAcademyContentAllowed lets a PENDING_APPROVAL user open lessons " +
    "in resolveOnboardingProgramId()'s program only; a lesson in any other " +
    "program 404s as 'lesson_not_found'/'day_not_found', never a 403 that " +
    "reveals the lesson exists",
  skip,
  () => {},
);

test(
  "ONBOARD-B: getOnboardingHomeDashboard returns academy:null (never a " +
    "fabricated course) when no PUBLISHED lesson exists in ANY TrainingProgram " +
    "yet — the honest empty state instead of a broken card",
  skip,
  () => {},
);

test(
  "ONBOARD-C: GET /api/home for accessStatus=PENDING_APPROVAL returns " +
    "kind:'onboarding' with no plan/xp/rating/mystery/management field present " +
    "at all (not merely null) — the type-level guarantee that a restricted " +
    "user's Home response can never be mistaken for a full dashboard",
  skip,
  () => {},
);

test(
  "ONBOARD-D: GET /api/home for accessStatus=LIMITED still 403s with " +
    "ACCESS_LIMITED exactly as it did before this sprint — widening the gate " +
    "to requireActiveAccess() for PENDING_APPROVAL must not also open Home to " +
    "LIMITED",
  skip,
  () => {},
);

test(
  "TEAM-A: /team's 'Подтвердить' action calls the existing " +
    "managerApi.approve(userId,'FULL',clubId) (POST /api/control/team/[id]/" +
    "approve) and refreshes the roster on success — no parallel approval path",
  skip,
  () => {},
);

test(
  "TEAM-B: /team hides 'Подтвердить' when the active club is a View-As-" +
    "CLUB_MANAGER preview (dashboard.isPreviewing) — read-only, per section 7; " +
    "the server independently rejects the write regardless via " +
    "requireClubManagerAccess() checking the REAL actor's own grants, never " +
    "the preview persona",
  skip,
  () => {},
);

test(
  "CITY-A: /city/club's 'Назначить управляющего' calls the existing " +
    "rolesApi.create({role:'CLUB_MANAGER', scopeType:'CLUB', clubId, userId}) " +
    "(POST /api/control/roles) — no parallel RoleAssignment backend (section 14)",
  skip,
  () => {},
);

test(
  "CITY-B: a club without a manager shows 'Не назначен' + a 'Назначить' CTA on " +
    "/city, /city/managers, and the Home 'Управляющие' preview alike — one " +
    "consistent empty state, not three different ones",
  skip,
  () => {},
);

test(
  "REGRESSION-A: a plain FULL MANAGER's GET /api/home response has " +
    "management:null and roleLabel:null, and /home renders the exact same " +
    "PlanCard/ContinueLearningCard/knowledge-base/XpCard/achievement/RatingCard/" +
    "MysteryCard sequence as before this sprint — zero DOM difference for the " +
    "unmanaged case",
  skip,
  () => {},
);

test(
  "REGRESSION-B: bottom navigation for FULL MANAGER/CLUB_MANAGER/CITY_MANAGER " +
    "is byte-for-byte identical (Главная/Академия/Метрик/База/Рейтинг, no 6th " +
    "'Управление' tab) — role differences live only inside Home + the /team, " +
    "/city* drill-down screens (section 17)",
  skip,
  () => {},
);
