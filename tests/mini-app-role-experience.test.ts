import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveContext, PERSONAL_CONTEXT } from "../src/lib/cabinet-ui";
import { visibleBottomNavRoutes } from "../src/lib/nav-items";
import type { HomeContextDTO } from "../src/lib/api/home-types";

/**
 * Sprint: mini-app-role-experience / mini-app-context-switcher.
 * CITY_MANAGER/CLUB_MANAGER move from the desktop /control cabinets into the
 * Mini App itself as SEPARATE role cabinets (Home renders exactly ONE of
 * PERSONAL/CLUB_MANAGER/CITY_MANAGER at a time, never a mix), switchable via
 * a compact context switcher whose options come from the real actor's
 * current grants; PENDING_APPROVAL gets a real, narrowed Home instead of a
 * full-screen block.
 *
 * `resolveActiveContext` (cabinet-ui.ts) is THE pure, shared authorization
 * boundary: it backs BOTH /api/home's server-side query-param validation AND
 * the client's persisted-localStorage reconciliation, so testing it once
 * here covers section 16's entire required list (composition, persistence,
 * revoke-safety, fabrication-resistance) without needing Postgres or a DOM —
 * same honest split as every prior sprint's test file in this repo (see
 * tests/cabinet-ui.test.ts's own header comment for the same,
 * already-established limitation on DB/DOM-dependent scenarios).
 */

const PERSONAL: HomeContextDTO = { type: "PERSONAL", label: "Личный кабинет" };
const CLUB_A: HomeContextDTO = { type: "CLUB_MANAGER", clubId: "club-a", clubName: "Клуб А", label: "Управляющий · Клуб А" };
const CLUB_B: HomeContextDTO = { type: "CLUB_MANAGER", clubId: "club-b", clubName: "Клуб Б", label: "Управляющий · Клуб Б" };
const CITY: HomeContextDTO = { type: "CITY_MANAGER", label: "Ст. города · Нижний Новгород" };

/* ------------------------------ resolveActiveContext ----------------------------- */

test("CTX-A: MANAGER only -> available is exactly [PERSONAL]; no request resolves to PERSONAL", () => {
  assert.deepEqual(resolveActiveContext(null, [PERSONAL]), PERSONAL);
});

test("CTX-B: MANAGER + CLUB_MANAGER(one club) -> requesting that exact club resolves it", () => {
  const available = [PERSONAL, CLUB_A];
  assert.deepEqual(resolveActiveContext({ type: "CLUB_MANAGER", clubId: "club-a" }, available), CLUB_A);
});

test("CTX-C: MANAGER + CITY_MANAGER -> requesting CITY_MANAGER resolves it", () => {
  const available = [PERSONAL, CITY];
  assert.deepEqual(resolveActiveContext({ type: "CITY_MANAGER" }, available), CITY);
});

test("CTX-D: all three at once (PERSONAL + two managed clubs + CITY_MANAGER) -> each club is independently selectable by its OWN clubId, never conflated by type alone (section 7 — never an arbitrarily picked club)", () => {
  const available = [PERSONAL, CLUB_A, CLUB_B, CITY];
  assert.deepEqual(resolveActiveContext({ type: "CLUB_MANAGER", clubId: "club-b" }, available), CLUB_B);
  assert.deepEqual(resolveActiveContext({ type: "CLUB_MANAGER", clubId: "club-a" }, available), CLUB_A);
  assert.deepEqual(resolveActiveContext({ type: "CITY_MANAGER" }, available), CITY);
  assert.deepEqual(resolveActiveContext(null, available), PERSONAL);
});

test("CTX-E: no requested context (fresh session, nothing persisted yet) -> falls back to PERSONAL", () => {
  assert.deepEqual(resolveActiveContext(null, [PERSONAL, CLUB_A]), PERSONAL);
});

test("CTX-F: a persisted VALID context is restored exactly (section 8 — bootstrap re-validates against current grants, then honors it)", () => {
  const available = [PERSONAL, CLUB_A, CITY];
  assert.deepEqual(resolveActiveContext({ type: "CITY_MANAGER" }, available), CITY);
});

test("CTX-G: a persisted CITY_MANAGER context whose grant was since revoked (no longer in available) -> falls back to PERSONAL, never a stale/broken render (section 9)", () => {
  const available = [PERSONAL]; // CITY_MANAGER grant revoked since this was persisted
  assert.deepEqual(resolveActiveContext({ type: "CITY_MANAGER" }, available), PERSONAL);
});

test("CTX-H: a persisted CLUB_MANAGER context for a club the actor no longer manages falls back to PERSONAL EVEN THOUGH the actor still holds CLUB_MANAGER for a different club — an exact clubId match is required, never just the type (section 9)", () => {
  const available = [PERSONAL, CLUB_B]; // used to also manage club-a, no longer does
  assert.deepEqual(resolveActiveContext({ type: "CLUB_MANAGER", clubId: "club-a" }, available), PERSONAL);
});

test("CTX-I: SECURITY — a plain MANAGER (available=[PERSONAL] only) cannot fabricate CITY_MANAGER or CLUB_MANAGER through a query param or a tampered localStorage value. The exact same function backs both /api/home's server-side validation and the client's persisted-context reconciliation, so there is exactly one boundary to bypass, and it always wins (section 3's critical requirement)", () => {
  const available = [PERSONAL];
  assert.deepEqual(resolveActiveContext({ type: "CITY_MANAGER" }, available), PERSONAL);
  assert.deepEqual(resolveActiveContext({ type: "CLUB_MANAGER", clubId: "anything" }, available), PERSONAL);
});

test("CTX-J: an unrecognized/garbage context type never matches anything, falls back safely", () => {
  assert.deepEqual(resolveActiveContext({ type: "SUPERADMIN" }, [PERSONAL, CITY]), PERSONAL);
});

test("CTX-K: no PERSONAL entry at all (a pure network-tier actor with no EmployeeProfile) and no match -> falls back to the first available entry rather than crashing", () => {
  assert.deepEqual(resolveActiveContext(null, [CITY]), CITY);
});

test("CTX-L: the caller has genuinely nothing available -> the last-resort PERSONAL_CONTEXT constant (should never happen in practice — every real user gets at least PERSONAL or one management context)", () => {
  assert.deepEqual(resolveActiveContext(null, []), PERSONAL_CONTEXT);
});

/* ------------------------- visibleBottomNavRoutes (PENDING_APPROVAL) -------- */
/* Covered in full by tests/product-navigation.test.ts's N/N2 — not duplicated
 * here; this file owns the new context-switcher-specific pure logic only. */
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
  "CTXDB-A: resolveAvailableHomeContexts(realUser, actor) for a plain MANAGER " +
    "(EmployeeProfile, no RoleAssignment grants) returns exactly [{type:" +
    "'PERSONAL'}]",
  skip,
  () => {},
);

test(
  "CTXDB-B: resolveAvailableHomeContexts for MANAGER + one active CLUB_MANAGER " +
    "grant returns [PERSONAL, CLUB_MANAGER(that club)] — one entry per managed " +
    "club, never a generic 'CLUB_MANAGER' entry with no clubId",
  skip,
  () => {},
);

test(
  "CTXDB-C: resolveAvailableHomeContexts for MANAGER + CITY_MANAGER returns " +
    "[PERSONAL, CITY_MANAGER] with scopeLabel derived from the actor's real " +
    "city/club coverage (distinctCityNames), never assuming one city",
  skip,
  () => {},
);

test(
  "CTXDB-D: resolveAvailableHomeContexts for an actor holding MANAGER + two " +
    "CLUB_MANAGER grants (different clubs) + CITY_MANAGER returns all four " +
    "entries — every managed club its own selectable context, never an " +
    "arbitrarily picked 'first' one (section 7)",
  skip,
  () => {},
);

test(
  "CTXDB-E: a real actor with no EmployeeProfile at all (pure network-tier " +
    "CITY_MANAGER) never gets a PERSONAL entry — no fabricated personal cabinet " +
    "with no data behind it",
  skip,
  () => {},
);

test(
  "CTXDB-F: resolveAvailableHomeContexts is cheap — only " +
    "resolveClubManagerClubs/resolveCityManagerClubs (id/name lookups), never " +
    "the full getCityManagerDashboard/getClubManagerHomeBlock queries; those run " +
    "exactly once, only for whichever ONE context ends up ACTIVE",
  skip,
  () => {},
);

test(
  "VIEWAS-CTX-A: GET /api/home during an active View-As-CLUB_MANAGER preview " +
    "ignores any ?context= query param entirely and always returns kind:" +
    "'club_manager' for the previewed club with isPreviewing:true and " +
    "availableContexts:[] — context switching does not apply during a preview " +
    "(section 13)",
  skip,
  () => {},
);

test(
  "VIEWAS-CTX-B: GET /api/home during an active View-As-MANAGER preview always " +
    "returns kind:'full' (getPersonalHomeDashboardForPreview) with " +
    "availableContexts:[] regardless of ?context=, and the client hides the " +
    "switcher entirely while user.viewContext is non-null",
  skip,
  () => {},
);

test(
  "VIEWAS-CTX-C: a CITY_MANAGER's own self-preview (previewRole:'CITY_MANAGER', " +
    "isPreviewing:false per effective-context.ts) is unaffected by the above — " +
    "normal context switching applies for the real actor",
  skip,
  () => {},
);

test(
  "RENDER-A: PERSONAL context (kind:'full') renders Plan/ContinueLearning/" +
    "knowledge-base/XP/achievement/Rating/Mystery and nothing else — no " +
    "CITY_MANAGER/CLUB_MANAGER block, guaranteed at the type level too " +
    "(HomeDashboardDTO has no `block` field at all)",
  skip,
  () => {},
);

test(
  "RENDER-B: CITY_MANAGER context (kind:'city_manager') renders ONLY Требует " +
    "внимания/Мои клубы/Управляющие/Обучение по клубам — no personal Plan/XP/" +
    "Rating/Mystery/achievements/knowledge-base card anywhere on the page, " +
    "guaranteed at the type level (CityManagerHomeContextDTO has no xp/rating/" +
    "mystery/achievementsCount fields)",
  skip,
  () => {},
);

test(
  "RENDER-C: CLUB_MANAGER context (kind:'club_manager') renders План на " +
    "сегодня + Требует внимания/Моя команда/Обучение команды/Мой клуб and " +
    "nothing personal beyond the plan — no XP/Rating/Mystery/achievements/" +
    "knowledge-base, guaranteed at the type level (ClubManagerHomeContextDTO " +
    "has only `plan` + `block`, no xp/rating/mystery/achievementsCount)",
  skip,
  () => {},
);

test(
  "STORAGE-A: home-context-storage.ts's loadStoredContext returns null (not a " +
    "crash) for missing localStorage, malformed JSON, a mismatched ownerKey " +
    "(different Telegram account), or an unrecognized `type` value",
  skip,
  () => {},
);

test(
  "STORAGE-B: saveStoredContext always writes exactly what the server's " +
    "activeContext said (home/page.tsx's post-fetch save), never a client-side " +
    "guess — so a silent server-side fallback (e.g. after a revoke) is what " +
    "gets persisted going forward, self-correcting on the next bootstrap",
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
  "REGRESSION-A: a plain FULL MANAGER's GET /api/home response is kind:'full' " +
    "with availableContexts having length 1 ([PERSONAL]), and /home renders the " +
    "exact same PlanCard/ContinueLearningCard/knowledge-base/XpCard/achievement/" +
    "RatingCard/MysteryCard sequence as before this sprint, with the identity " +
    "line NON-tappable (no chevron, no switcher) — zero DOM difference for the " +
    "unmanaged case",
  skip,
  () => {},
);

test(
  "REGRESSION-B: bottom navigation for FULL MANAGER/CLUB_MANAGER/CITY_MANAGER " +
    "is byte-for-byte identical (Главная/Академия/Метрик/База/Рейтинг, no 6th " +
    "'Управление' tab) — role differences live only inside Home's active " +
    "context + the /team, /city* drill-down screens (section 11)",
  skip,
  () => {},
);
