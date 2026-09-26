import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pluralRu,
  distinctCityNames,
  clubsWithoutManager,
  groupPendingApprovalByClub,
  attentionCardCount,
  canRestoreAssignment,
} from "../src/lib/cabinet-ui";
import type { AttentionItemDTO, CityManagerClubSummaryDTO } from "../src/lib/api/cabinet-types";

/**
 * Sprint: role-cabinets, step 5 — CITY_MANAGER cabinet UI
 * (CityManagerCabinet.tsx / CityManagerClubDetail.tsx / ClubManagerAssignModal.tsx).
 *
 * HONEST LIMITATION: this repo's test runner is Node's built-in
 * `node --import tsx --test`, with no jsdom/React Testing Library installed
 * (verified — no such dependency in package.json, no existing *.test.tsx
 * anywhere in this codebase across five prior sprint phases). Component
 * RENDER behavior (does clicking a button call the right API, does a given
 * DTO produce the right DOM) genuinely cannot be unit-tested in this
 * environment without adding a new test-infrastructure dependency, which
 * was not asked for and would be a meaningfully different change than this
 * step's UI work. Per this step's own instruction ("do not fake DOM tests"),
 * this file does NOT pretend to cover that — every fact a component decides
 * PURELY from data (no DOM, no fetch) has been extracted into
 * src/lib/cabinet-ui.ts specifically so it has real coverage below; every
 * remaining section-19 scenario that genuinely needs a live server, a real
 * DOM, or both is an explicit skip stub, not a fabricated pass.
 */

function attn(overrides: Partial<AttentionItemDTO> = {}): AttentionItemDTO {
  return { category: "CLUB_WITHOUT_CLUB_MANAGER", entityType: "club", entityId: "e1", entityName: "Клуб", cityId: "c1", clubId: "club-1", ...overrides };
}

/* --------------------------------- pluralRu -------------------------------- */

test("PLURAL-A: pluralRu picks the correct Russian form for 1/2/5/11/21", () => {
  assert.equal(pluralRu(1, "клуб", "клуба", "клубов"), "клуб");
  assert.equal(pluralRu(2, "клуб", "клуба", "клубов"), "клуба");
  assert.equal(pluralRu(5, "клуб", "клуба", "клубов"), "клубов");
  assert.equal(pluralRu(11, "клуб", "клуба", "клубов"), "клубов"); // the "teens" exception
  assert.equal(pluralRu(21, "клуб", "клуба", "клубов"), "клуб"); // 21 mod 10 = 1, but not a "teen"
  assert.equal(pluralRu(0, "клуб", "клуба", "клубов"), "клубов");
});

/* ----------------------------- distinctCityNames ---------------------------- */

function club(overrides: Partial<CityManagerClubSummaryDTO> = {}): CityManagerClubSummaryDTO {
  return {
    clubId: "club-1",
    clubName: "Клуб",
    cityId: "city-1",
    cityName: "Воронеж",
    employeeCount: 0,
    activeClubManager: null,
    pendingApprovalCount: 0,
    attentionCount: 0,
    trainingCompletionPercent: null,
    ...overrides,
  };
}

test("HEADER-A: one city -> a single-element array (the header shows just that city's name)", () => {
  assert.deepEqual(distinctCityNames([club({ cityName: "Воронеж" }), club({ cityName: "Воронеж" })]), ["Воронеж"]);
});

test("HEADER-B: several cities -> every distinct name, never assuming 'one city' (section 4's explicit requirement)", () => {
  const names = distinctCityNames([club({ cityName: "Воронеж" }), club({ cityName: "Казань" })]);
  assert.deepEqual([...names].sort(), ["Воронеж", "Казань"]);
});

test("HEADER-C: an explicit club-only scope (no city name resolved) -> empty array, not a crash or a fake city", () => {
  assert.deepEqual(distinctCityNames([club({ cityName: null })]), []);
});

test("HEADER-D: no clubs at all -> empty array", () => {
  assert.deepEqual(distinctCityNames([]), []);
});

/* -------------------------------- attention model --------------------------- */

test("ATTN-A: clubsWithoutManager returns only CLUB_WITHOUT_CLUB_MANAGER items, in order", () => {
  const items = [attn({ category: "CLUB_WITHOUT_CLUB_MANAGER", entityId: "a" }), attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "b" })];
  assert.deepEqual(clubsWithoutManager(items).map((i) => i.entityId), ["a"]);
});

test("ATTN-B: groupPendingApprovalByClub collapses multiple employees in the SAME club into one group with the right count — section 6's own '2 сотрудника ожидают подтверждения' example is an aggregate, not one row per employee", () => {
  const items = [
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "emp-1", clubId: "club-1" }),
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "emp-2", clubId: "club-1" }),
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "emp-3", clubId: "club-2" }),
  ];
  const groups = groupPendingApprovalByClub(items).sort((a, b) => a.clubId.localeCompare(b.clubId));
  assert.deepEqual(groups, [
    { clubId: "club-1", count: 2 },
    { clubId: "club-2", count: 1 },
  ]);
});

test("ATTN-C: an item with no clubId is skipped rather than grouped under a fake key", () => {
  const items = [attn({ category: "PENDING_EMPLOYEE_APPROVAL", clubId: null })];
  assert.deepEqual(groupPendingApprovalByClub(items), []);
});

test("ATTN-D: attentionCardCount counts CARDS (grouped), not raw items — 3 pending employees in one club + 1 club without a manager = 2 cards, not 4", () => {
  const items = [
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "e1", clubId: "club-1" }),
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "e2", clubId: "club-1" }),
    attn({ category: "PENDING_EMPLOYEE_APPROVAL", entityId: "e3", clubId: "club-1" }),
    attn({ category: "CLUB_WITHOUT_CLUB_MANAGER", entityId: "club-2" }),
  ];
  assert.equal(attentionCardCount(items), 2);
});

test("ATTN-E: an empty attention list -> 0 cards (drives the 'Сейчас ничего не требует внимания' empty state)", () => {
  assert.equal(attentionCardCount([]), 0);
});

test("ATTN-F: an unrecognized/future category (e.g. a server sending TRAINING_INCOMPLETE some day) is silently excluded, never rendered as a broken card — section 6's 'do NOT invent TRAINING_INCOMPLETE yet' boundary enforced on the client side too", () => {
  const items = [{ ...attn(), category: "TRAINING_INCOMPLETE" as unknown as AttentionItemDTO["category"] }];
  assert.equal(attentionCardCount(items), 0);
});

/* ------------------------------ restore guard ------------------------------- */

test("RESTORE-A: canRestoreAssignment is true only when there is NO current active manager — 'do not silently create duplicates' (section 9)", () => {
  assert.equal(canRestoreAssignment(false), true);
  assert.equal(canRestoreAssignment(true), false);
});

/* ============================ Section 19 — remaining scenarios ============= */
/*
 * Everything below needs a live Postgres + running server (the dashboard's
 * actual DTO shape end-to-end, already exercised in principle by step 4's
 * cabinet-dashboards.test.ts) and/or a real DOM (does the component actually
 * render the right text/call the right handler) — neither is available in
 * this sandbox. Explicit skip stubs, per this step's own instruction not to
 * fake DOM tests.
 */

test(
  "UI-A: CityManagerCabinet's initial fetch calls GET /api/control/cabinet/city-manager " +
    "exactly once on mount and renders the returned DTO's exact summary numbers " +
    "(clubCount/employeeCount/clubManagerCount/pendingApprovalCount) with no " +
    "client-side recomputation — already true by construction (SummaryCard " +
    "receives the DTO's own fields directly, cabinet-dashboards.test.ts covers " +
    "the DTO's own correctness) but not exercised end-to-end here",
  { skip: "integration: requires a DOM/component harness (not installed) + running server" },
  () => {},
);

test(
  "UI-B: training=null renders 'Нет данных' (never '0%'); the summary cards " +
    "still render even when training is null (they're independent fields)",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);

test(
  "UI-C: an empty clubs[] array renders 'В вашей зоне пока нет клубов.' — " +
    "never a blank section",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);

test(
  "UI-D: assigning a CLUB_MANAGER (ClubManagerAssignModal) calls " +
    "rolesApi.create({role:'CLUB_MANAGER', scopeType:'CLUB', clubId}) with the " +
    "selected employee's userId, then triggers a dashboard reload on success " +
    "— the existing role-assignment API (src/app/api/control/roles), no second " +
    "backend",
  { skip: "integration: requires a DOM/component harness + running server" },
  () => {},
);

test(
  "UI-E: revoking a club manager calls rolesApi.revoke(assignmentId) (the " +
    "existing lifecycle endpoint) and removes that row from the Управляющие " +
    "table on success",
  { skip: "integration: requires a DOM/component harness + running server" },
  () => {},
);

test(
  "UI-F: restoring a SUSPENDED assignment calls rolesApi.restore(id); if the " +
    "club already has a different active manager, the button is disabled " +
    "client-side (canRestoreAssignment, tested above) AND the server's own " +
    "409 duplicate_active_assignment surfaces a message if it's ever hit anyway",
  { skip: "integration: requires a DOM/component harness + running server" },
  () => {},
);

test(
  "UI-G: the club detail page's 'Просмотреть как' controls call " +
    "viewAsApi.start({role:'CLUB_MANAGER', clubId}) and, for MANAGER, require " +
    "a previewPositionId to be chosen before the button is enabled (mirrors " +
    "the server-side startViewAsSchema requirement — SCHEMA-E in rbac.test.ts) " +
    "— the existing Phase 2D View As infrastructure is never reimplemented here",
  { skip: "integration: requires a DOM/component harness + running server" },
  () => {},
);

test(
  "UI-H: a plain MANAGER navigating directly to /control/city or " +
    "/control/city/club?clubId=... by URL is denied — the page-level " +
    "hasActiveRole(actor.grants,'CITY_MANAGER') check (or, for a MANAGER with " +
    "no legacy elevated AppRole, the outer control/(portal)/layout.tsx gate, " +
    "unchanged this step) renders AccessDenied server-side before any client " +
    "component mounts; the API routes underneath independently 403 regardless " +
    "(already covered by cabinet-dashboards.test.ts's CM-DASH-G)",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);

test(
  "UI-I: a fetch failure (network error, 500) on any of the three cabinet " +
    "screens renders the shared error state (message + Retry button) rather " +
    "than an unhandled promise rejection or a blank screen — CityManagerCabinet " +
    "and CityManagerClubDetail both branch on status==='error' before ever " +
    "reaching a null-dashboard render",
  { skip: "integration: requires a DOM/component harness" },
  () => {},
);
