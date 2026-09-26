import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveManagedClubSelection,
  filterPendingEmployees,
  planWidgetState,
  type ClubRef,
} from "../src/lib/cabinet-ui";

/**
 * Sprint: role-cabinets, step 6 — CLUB_MANAGER cabinet UI
 * (ClubManagerCabinet.tsx / cabinet-ui.ts additions / the backend RBAC
 * bridge for approve/access).
 *
 * Same honest limitation as tests/cabinet-ui.test.ts (step 5): no DOM/
 * component test harness exists in this repo. Every scenario section 23
 * asks for is either (a) real, pure logic — extracted into cabinet-ui.ts
 * specifically so it has genuine coverage below — or (b) a skip stub,
 * mapped explicitly to section 23's own A-N list so the mapping is
 * traceable, never silently dropped.
 */

function club(overrides: Partial<ClubRef> = {}): ClubRef {
  return { id: "club-1", name: "Клуб", cityId: "city-1", cityName: "Воронеж", ...overrides };
}

/* --------------------------- resolveManagedClubSelection -------------------- */
/* Covers section 23-N: multiple CLUB_MANAGER grants handled deterministically. */

test("MANAGED-A: zero managed clubs -> 'none' (never auto-picks something that doesn't exist)", () => {
  assert.deepEqual(resolveManagedClubSelection([]), { kind: "none" });
});

test("MANAGED-B: exactly one managed club -> auto-selected (section 3's explicit requirement)", () => {
  const c = club();
  assert.deepEqual(resolveManagedClubSelection([c]), { kind: "auto", club: c });
});

test("MANAGED-C: two or more managed clubs -> 'select', carrying ALL candidates, never just the first ('never silently pick an arbitrary first club')", () => {
  const a = club({ id: "club-1" });
  const b = club({ id: "club-2" });
  const result = resolveManagedClubSelection([a, b]);
  assert.equal(result.kind, "select");
  if (result.kind === "select") assert.deepEqual(result.clubs.map((c) => c.id), ["club-1", "club-2"]);
});

/* ------------------------------ filterPendingEmployees ---------------------- */
/* Covers section 23-D: pending employees appear in "Новые сотрудники". */

test("PENDING-A: filterPendingEmployees keeps only PENDING_APPROVAL members, in order", () => {
  const team = [
    { accessStatus: "FULL" as const, id: "a" },
    { accessStatus: "PENDING_APPROVAL" as const, id: "b" },
    { accessStatus: "PENDING_APPROVAL" as const, id: "c" },
    { accessStatus: "SUSPENDED" as const, id: "d" },
  ];
  assert.deepEqual(filterPendingEmployees(team).map((m) => m.id), ["b", "c"]);
});

test("PENDING-B: an empty team -> empty result (drives the 'Сейчас ничего не требует внимания' state)", () => {
  assert.deepEqual(filterPendingEmployees([]), []);
});

/* --------------------------------- planWidgetState -------------------------- */
/* Covers section 23-J: daily plan null does not crash. */

test("PLANSTATE-A: a null plan -> 'no-data' (the acting user has no computable plan — never a crash, never a fabricated empty list)", () => {
  assert.equal(planWidgetState(null), "no-data");
});

test("PLANSTATE-B: a plan with zero tasks -> 'empty' (an honest 'nothing today', distinct from 'no-data')", () => {
  assert.equal(planWidgetState({ tasks: [] }), "empty");
});

test("PLANSTATE-C: a plan with tasks -> 'has-tasks'", () => {
  assert.equal(planWidgetState({ tasks: [{}] }), "has-tasks");
});

/* ============================ Section 23 — remaining scenarios ============= */

test(
  "CLM-UI-A: a real CLUB_MANAGER (legacy AppRole or an active RoleAssignment " +
    "grant) loads their own dashboard via GET /api/control/cabinet/club-manager " +
    "with no clubId needed when they manage exactly one club (resolveManagedClubSelection's " +
    "'auto' path, wired end-to-end)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-B: the team roster (.../club-manager/team) lists exactly the " +
    "resolved club's employees — already covered structurally by step 4's " +
    "cabinet-dashboards.test.ts (CLM-DASH-B); restated here as this step's " +
    "own acceptance criterion for the new /control/club page specifically",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-C: DIRECT ATTACK — requesting ?clubId=<a club the actor does NOT " +
    "manage> is denied (403), never silently redirected to the actor's real " +
    "club nor allowed through — resolveClubManagerCabinetAccess's three-tier " +
    "check (step 4) is unchanged by this step; already covered by " +
    "cabinet-dashboards.test.ts's CLM-DASH-D",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-D: pending employees render under 'Новые сотрудники' — the " +
    "grouping/filtering itself (filterPendingEmployees) is proven above; this " +
    "is the remaining DOM-rendering half",
  { skip: "integration: requires a DOM/component harness (not installed)" },
  () => {},
);

test(
  "CLM-UI-E: approving a pending employee calls managerApi.approve(userId, " +
    "'FULL', clubId) — the EXISTING /api/control/team/[id]/approve endpoint, " +
    "unchanged in shape; this step only extended its GATE (requireClubManagerAccess, " +
    "authz.ts) to also accept an active CLUB_MANAGER RoleAssignment grant, not " +
    "just the legacy AppRole — never a new approval backend",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-F: a successful approval reloads the dashboard+team (reload()), so " +
    "the approved employee moves out of 'Новые сотрудники' and " +
    "pendingApprovalCount decrements — without a manual page refresh",
  { skip: "integration: requires a DOM/component harness + running server" },
  () => {},
);

test(
  "CLM-UI-G: training=null renders 'Нет данных' everywhere (summary card and " +
    "the training section) — never a fabricated 0%; the DTO-level null case " +
    "is already covered by cabinet-dashboards.test.ts",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);

test(
  "CLM-UI-H: a team member with latestTestResult=null renders 'Нет данных' " +
    "in the Тест column, never a crash from destructuring a null result — " +
    "the component's own code is a plain ternary, no destructuring assumed",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);

test(
  "CLM-UI-I: an empty club (zero employees) renders valid empty states in " +
    "every section (Команда: 'В клубе пока нет сотрудников.', attention: " +
    "positive empty state, plan independent of employee count) — never a 500 " +
    "or a blank screen; the DTO-level empty case is already covered by " +
    "cabinet-dashboards.test.ts's CLM-DASH-G",
  { skip: "integration: requires Postgres + a DOM/component harness" },
  () => {},
);

test(
  "CLM-UI-J: a null Daily Plan renders 'Нет данных о плане.' — proven at the " +
    "decision level by PLANSTATE-A above; this is the remaining DOM half",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);

test(
  "CLM-UI-K: a CITY_MANAGER with an active View-As-CLUB_MANAGER-of-club-X " +
    "preview visiting /control/club (no page-level role gate, by design — see " +
    "that page's own doc comment) gets club X's dashboard reads working " +
    "correctly — already covered by rbac-foundation/cabinet-dashboards.test.ts's " +
    "VIEWAS-CAB-A/B (step 5); the redirect target after starting the preview " +
    "was updated this step to /control/club?clubId=X instead of /control/team",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-L: during that same preview, ClubManagerDashboardDTO.isPreviewing=" +
    "true hides the 'Подтвердить' button and every Daily Plan mutation " +
    "control (complete/skip/checklist) client-side; independently, the real " +
    "server-side block is the global View-As middleware (unchanged) plus " +
    "requireClubManagerAccess/requireFullAccess evaluating the REAL actor " +
    "(a previewing CITY_MANAGER has no real CLUB_MANAGER grant for club X in " +
    "the common case, so even a forged request would 403) — the UI flag is " +
    "cosmetic, never the actual authorization boundary",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-M: a plain MANAGER cannot reach /control/club at all — blocked at " +
    "the outer control/(portal)/layout.tsx gate (canAccessControl(role) || " +
    "systemAccess || isCityManager || isOperationsDirector || isClubManager, " +
    "all false for a plain MANAGER with no elevated legacy role and no " +
    "RoleAssignment grants) before this page's own client component ever " +
    "mounts; the API layer (resolveClubManagerCabinetAccess) independently " +
    "403s regardless",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "CLM-UI-N: multiple CLUB_MANAGER grants for the same real actor render the " +
    "club-selection screen and, once a club is chosen, load exactly that " +
    "club's data — proven at the decision level by MANAGED-C above; this is " +
    "the remaining end-to-end half",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
