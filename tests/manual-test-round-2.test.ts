import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describeRoleAssignmentError, resolveActiveAcademySection, homeContextToAcademySection } from "../src/lib/cabinet-ui";
import { resolveAllowedAcademySections, resolveAllowedAcademySectionsForPersona } from "../src/lib/server/rbac/scope-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * METRO UP — MANUAL TEST ROUND 2 FIXES.
 *
 * Same honest split as every prior sprint's test file in this repo: pure,
 * DB-free decision functions are exercised for real below (this round's P0
 * fix already has real coverage in tests/middleware.test.ts's MW-H/MW-I —
 * not duplicated here). Everything DB/DOM-dependent (the actual assignment
 * write path end-to-end, Academy's server-side program filtering, the
 * context switcher's/Academy tabs'/rating toggle's real rendering, View As
 * CLUB_MANAGER preview end-to-end) is an explicit skip stub, matching this
 * repo's established convention (no Postgres fixture or DOM harness
 * installed — see tests/cabinet-ui.test.ts's own header comment).
 */

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "grant-1", role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return { userId: "user-1", appRole: "EMPLOYEE", accessStatus: null, onboardingCompleted: true, employeeClubId: null, grants: [], ...overrides };
}

/* ------------------------- describeRoleAssignmentError (section 1, P0) ------------------------- */

test("ERRMSG-A: VIEW_AS_READ_ONLY gets the specific, actionable message — the P0 bug's actual root cause, never hidden behind a generic string", () => {
  assert.match(describeRoleAssignmentError("VIEW_AS_READ_ONLY"), /режиме просмотра/);
});

test("ERRMSG-B: every other KNOWN code (forbidden/club_not_found/user_not_found/assignment_already_active/rate_limited) gets its own specific message, never the same blanket string — assignment_already_active and duplicate_active_assignment are the one deliberate exception, mapping to the same real-world condition from two different call sites", () => {
  const codes = ["forbidden", "club_not_found", "user_not_found", "assignment_already_active", "rate_limited", "unauthorized"];
  const messages = codes.map(describeRoleAssignmentError);
  assert.equal(new Set(messages).size, messages.length, "every known code must map to a distinct message");
  for (const m of messages) assert.ok(m.length > 0);
  assert.equal(describeRoleAssignmentError("duplicate_active_assignment"), describeRoleAssignmentError("assignment_already_active"));
});

test("ERRMSG-C: an UNRECOGNIZED code is never silently swallowed — the message still includes the raw code so a real-device tester can report exactly what happened", () => {
  const msg = describeRoleAssignmentError("some_future_error_code");
  assert.match(msg, /some_future_error_code/);
});

test("ERRMSG-D: no code at all (network failure, non-ApiError) still returns a non-empty, honest message", () => {
  assert.ok(describeRoleAssignmentError(null).length > 0);
  assert.ok(describeRoleAssignmentError(undefined).length > 0);
});

/* --------------------------- Academy role sections (section 4) --------------------------- */

test("ACAD-SECTIONS-A: MANAGER only (no CLUB_MANAGER/CITY_MANAGER grant) -> allowed is exactly [MANAGER]", () => {
  assert.deepEqual(resolveAllowedAcademySections(actor({ grants: [] })), ["MANAGER"]);
});

test("ACAD-SECTIONS-B: an active CLUB_MANAGER grant -> [MANAGER, CLUB_MANAGER] — matches the approved matrix exactly", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", clubId: "club-1" })] });
  assert.deepEqual(resolveAllowedAcademySections(a), ["MANAGER", "CLUB_MANAGER"]);
});

test("ACAD-SECTIONS-C: an active CITY_MANAGER grant -> all three sections, EVEN WITHOUT a separate explicit CLUB_MANAGER grant — 'higher role may access training of roles below it'", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.deepEqual(resolveAllowedAcademySections(a), ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]);
});

test("ACAD-SECTIONS-D: a SUSPENDED/ENDED CLUB_MANAGER or CITY_MANAGER grant never counts — only ACTIVE grants are exercisable", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1", status: "SUSPENDED" })] });
  assert.deepEqual(resolveAllowedAcademySections(a), ["MANAGER"]);
});

test("ACAD-SECTIONS-E: a real actor holding BOTH CLUB_MANAGER and CITY_MANAGER grants still gets the CITY_MANAGER-hierarchy result, not a naive union/duplicate", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", clubId: "club-1" }), grant({ id: "g2", role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.deepEqual(resolveAllowedAcademySections(a), ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]);
});

/* --------------------- resolveAllowedAcademySectionsForPersona (Round E0, section 2 fix) --------------------- */

test("ACAD-PERSONA-A: previewRole='CLUB_MANAGER' caps allowed sections to [MANAGER, CLUB_MANAGER] EVEN WHEN the real actor underneath holds a CITY_MANAGER grant — the exact live bug ('CLUB_MANAGER Academy showed Менеджер/Управляющий/Ст. города') reproduced and fixed", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.deepEqual(resolveAllowedAcademySectionsForPersona(a, "CLUB_MANAGER"), ["MANAGER", "CLUB_MANAGER"]);
});

test("ACAD-PERSONA-B: previewRole='MANAGER' caps allowed sections to exactly [MANAGER], even over a CITY_MANAGER real actor — a MANAGER-persona preview never sees ANY management tab", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.deepEqual(resolveAllowedAcademySectionsForPersona(a, "MANAGER"), ["MANAGER"]);
});

test("ACAD-PERSONA-C: previewRole=null (not previewing, OR a CITY_MANAGER's own non-substituting self-preview) falls through to the real actor's own resolveAllowedAcademySections, unchanged — a real CITY_MANAGER still correctly gets all three sections", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.deepEqual(resolveAllowedAcademySectionsForPersona(a, null), ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]);
});

test("ACAD-PERSONA-D: previewRole=null with a plain MANAGER actor (no preview at all, the common case) is unaffected — still exactly [MANAGER]", () => {
  assert.deepEqual(resolveAllowedAcademySectionsForPersona(actor({ grants: [] }), null), ["MANAGER"]);
});

test("ACAD-PERSONA-WIRE: every Academy GET route that computes allowedSections now imports resolveAllowedAcademySectionsForPersona (not the bare, real-actor-only resolveAllowedAcademySections) and derives previewRole from resolveEffectiveReadContext's own isPreviewing/viewContext — the exact fix for 'direct URL forbidden outside the PREVIEWED role's allowed target role', not just the real actor's", () => {
  for (const file of [
    "src/app/api/academy/overview/route.ts",
    "src/app/api/academy/state/route.ts",
    "src/app/api/academy/days/[id]/route.ts",
    "src/app/api/academy/lessons/[slug]/route.ts",
  ]) {
    const src = read(file);
    assert.match(src, /resolveAllowedAcademySectionsForPersona/, `${file} should use the persona-aware resolver`);
    assert.doesNotMatch(src, /\bresolveAllowedAcademySections\(/, `${file} should not call the bare real-actor-only resolver directly`);
    assert.match(src, /effective\.isPreviewing \? \(effective\.viewContext!\.previewRole as "MANAGER" \| "CLUB_MANAGER"\) : null/);
  }
});

/**
 * Sprint: REMEDIATION R2, F-02 — the three Academy mutation routes now ALSO
 * use the persona-aware resolver, matching their GET sibling
 * (lessons/[slug]/route.ts, asserted by ACAD-PERSONA-WIRE above). This was
 * previously asserted the OTHER way (deliberately still bare) on the
 * reasoning that src/middleware.ts's VIEW_AS_READ_ONLY block already
 * rejects every mutating request during an active MANAGER/CLUB_MANAGER
 * persona preview before any route handler runs — true, and still true
 * (middleware.test.ts's MW-D runs the real middleware function against
 * exactly one of these three paths and is UNCHANGED by this fix). The
 * persona-aware swap is Layer 2, defense-in-depth: it has no effect on any
 * request that reaches a correctly-configured middleware, and only matters
 * if Layer 1 is ever bypassed or misconfigured for one path — a mutation
 * route's own authorization should never be silently built on the real
 * actor's broader, un-substituted grant set.
 */
test("ACAD-PERSONA-WIRE-MUTATIONS: the three Academy mutation routes (complete/quiz/start) now use the persona-aware resolveAllowedAcademySectionsForPersona, deriving previewRole from resolveEffectiveReadContext exactly like their GET sibling — Layer 1 (middleware, MW-D) is untouched and independently still blocks every one of these paths during a genuine persona preview", () => {
  for (const file of [
    "src/app/api/academy/lessons/[slug]/complete/route.ts",
    "src/app/api/academy/lessons/[slug]/quiz/route.ts",
    "src/app/api/academy/lessons/[slug]/start/route.ts",
  ]) {
    const src = read(file);
    assert.match(src, /resolveAllowedAcademySectionsForPersona/, `${file} should use the persona-aware resolver`);
    assert.doesNotMatch(src, /resolveAllowedAcademySections\(actor\)/, `${file} should not call the bare real-actor-only resolver directly`);
    assert.match(src, /effective\.isPreviewing \? \(effective\.viewContext!\.previewRole as "MANAGER" \| "CLUB_MANAGER"\) : null/, `${file} should derive previewRole exactly like the GET sibling`);
    // The actual mutation (startLesson/completeLesson/submitQuiz) must still
    // be audited/recorded against the REAL actor, never the synthetic persona.
    assert.doesNotMatch(src, /(startLesson|completeLesson|submitQuiz)\(effectiveUser\.id/, `${file} must mutate against the real actor's id, never effectiveUser.id`);
  }
});

/* ------------------------- resolveActiveAcademySection (section 4) ------------------------- */

test("ACAD-ACTIVE-A: no requested section -> falls back to MANAGER (the universal baseline)", () => {
  assert.equal(resolveActiveAcademySection(null, ["MANAGER"]), "MANAGER");
  assert.equal(resolveActiveAcademySection(undefined, ["MANAGER", "CLUB_MANAGER"]), "MANAGER");
});

test("ACAD-ACTIVE-B: a requested section that IS in the allowed list is honored exactly", () => {
  assert.equal(resolveActiveAcademySection("CLUB_MANAGER", ["MANAGER", "CLUB_MANAGER"]), "CLUB_MANAGER");
  assert.equal(resolveActiveAcademySection("CITY_MANAGER", ["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]), "CITY_MANAGER");
});

test("ACAD-ACTIVE-C: SECURITY — a plain MANAGER (allowed=[MANAGER] only) cannot fabricate CLUB_MANAGER/CITY_MANAGER through a query param or tampered localStorage value; falls back to MANAGER every time (section 4's explicit 'cannot be fabricated' requirement)", () => {
  assert.equal(resolveActiveAcademySection("CLUB_MANAGER", ["MANAGER"]), "MANAGER");
  assert.equal(resolveActiveAcademySection("CITY_MANAGER", ["MANAGER"]), "MANAGER");
});

test("ACAD-ACTIVE-D: a CLUB_MANAGER cannot fabricate CITY_MANAGER even though they DO have a legitimately elevated allowed list", () => {
  assert.equal(resolveActiveAcademySection("CITY_MANAGER", ["MANAGER", "CLUB_MANAGER"]), "MANAGER");
});

test("ACAD-ACTIVE-E: an unrecognized/garbage section string never matches anything, falls back safely", () => {
  assert.equal(resolveActiveAcademySection("SUPERADMIN", ["MANAGER", "CITY_MANAGER"]), "MANAGER");
});

test("ACAD-ACTIVE-F: if MANAGER is somehow absent from allowed (should not happen in practice), falls back to the first allowed entry rather than crashing", () => {
  assert.equal(resolveActiveAcademySection(null, ["CITY_MANAGER"]), "CITY_MANAGER");
});

/* ------------------------- homeContextToAcademySection (section 4) ------------------------- */

test("ACAD-DEFAULT-A: PERSONAL Home context -> MANAGER Academy section (Personal trains as a Manager)", () => {
  assert.equal(homeContextToAcademySection("PERSONAL"), "MANAGER");
});

test("ACAD-DEFAULT-B: CLUB_MANAGER/CITY_MANAGER Home context map 1:1 to the same-named Academy section", () => {
  assert.equal(homeContextToAcademySection("CLUB_MANAGER"), "CLUB_MANAGER");
  assert.equal(homeContextToAcademySection("CITY_MANAGER"), "CITY_MANAGER");
});

/* ============================ Integration scenarios ========================= */
/*
 * DB/DOM-dependent — explicit skip stubs, per this repo's established
 * convention. The P0 root-cause fix itself (CITY_MANAGER self-preview
 * exempted from the global View-As write-block) already has REAL coverage
 * in tests/middleware.test.ts's MW-H/MW-I — not duplicated here.
 */
const skip = { skip: "integration: requires Postgres / DOM harness (not installed)" } as const;

test(
  "ASSIGN-A: CITY_MANAGER assigns CLUB_MANAGER to an eligible employee of a " +
    "club in their own scope -> 201, the /city/club screen refetches and the " +
    "new manager appears immediately in 'Управляющий' — the P0 acceptance " +
    "criterion end-to-end",
  skip,
  () => {},
);

test(
  "ASSIGN-B: CITY_MANAGER attempts to assign CLUB_MANAGER for a club OUTSIDE " +
    "their scope -> 403 forbidden (canAssignRole's grantCoversClub check, " +
    "unchanged by this round's P0 fix) — foreign-club assignment remains " +
    "forbidden, RBAC not weakened",
  skip,
  () => {},
);

test(
  "ASSIGN-C: a genuine MANAGER/CLUB_MANAGER View-As preview (persona " +
    "substitution, NOT the CITY_MANAGER self-preview this round's fix " +
    "exempts) still 403s every mutation, including role assignment — the fix " +
    "narrowly targets self-preview only",
  skip,
  () => {},
);

test(
  "VIEWAS-CLUBMGR-A: /city/club's 'Посмотреть кабинет Управляющего' calls " +
    "viewAsApi.start({role:'CLUB_MANAGER', clubId}) (the EXISTING View As " +
    "infrastructure, no new mechanism) and works even when the club has NO " +
    "real CLUB_MANAGER assigned yet — buildSyntheticPersona builds the read " +
    "persona from clubId alone, never from an existing RoleAssignment row " +
    "(audited before implementing, see cabinet-dashboards.ts/effective-context.ts)",
  skip,
  () => {},
);

test(
  "VIEWAS-CLUBMGR-B: during the preview, Home shows kind:'club_manager' with " +
    "block.isPreviewing:true (no assign/revoke/approve controls, no Daily " +
    "Plan mutation) and a visible 'Вернуться к кабинету Ст. города' action " +
    "(ReturnToCityCabinetCard) alongside the global ViewAsBanner, which now " +
    "also names the previewed club (scopeLabel)",
  skip,
  () => {},
);

test(
  "VIEWAS-CLUBMGR-C: foreign-scope preview is forbidden — canStartViewAs " +
    "rejects a CLUB_MANAGER/MANAGER target clubId outside the CITY_MANAGER's " +
    "own grants (unchanged; this round adds no new preview mechanism)",
  skip,
  () => {},
);

test(
  "CTXSWITCH-VIS-A: the new 'Кабинет' pill (icon + eyebrow + chevron) renders " +
    "only when availableContexts.length > 1 and no View As preview is active; " +
    "a plain MANAGER with only PERSONAL sees the original plain-text identity " +
    "line, no pill, no chevron — 'do not render a useless switcher'",
  skip,
  () => {},
);

test(
  "ACADSRV-A: GET /api/academy/overview?section=CITY_MANAGER for a real " +
    "CITY_MANAGER returns only programs with targetRole=CITY_MANAGER — " +
    "server-partitioned (resolveAcademyProgramIdsForSection), never merely " +
    "client-hidden; a plain MANAGER requesting the same section gets " +
    "activeSection:'MANAGER' back (silently corrected, per resolveActiveAcademySection)",
  skip,
  () => {},
);

test(
  "ACADSRV-B: a direct GET /api/academy/lessons/:slug for a lesson whose " +
    "program.targetRole is outside the actor's allowedSections 404s as " +
    "'lesson_not_found' — never merely hidden from the list, an unauthorized " +
    "role section cannot be reached via a direct link either",
  skip,
  () => {},
);

test(
  "ACADSRV-C: existing pre-migration programs all have targetRole=MANAGER " +
    "(the column default) — zero visibility change for any program that " +
    "existed before this round's migration, confirming the migration is " +
    "additive, not destructive",
  skip,
  () => {},
);

test(
  "ACADDEFAULT-A: opening /academy right after switching Home to the " +
    "CLUB_MANAGER context defaults the Academy tab to CLUB_MANAGER (reads " +
    "the SAME persisted metro_up_active_context_v1 value Home uses) — the " +
    "user can still manually switch to MANAGER within the same session",
  skip,
  () => {},
);

test(
  "RATING-VIS-A: GET /api/rating's canViewClubMode is true only for a real " +
    "CITY_MANAGER (hasActiveRole check, never a query param) — a MANAGER/" +
    "CLUB_MANAGER never sees the Менеджеры/Клубы toggle even if they set " +
    "localStorage to claim a CITY_MANAGER Home context",
  skip,
  () => {},
);

test(
  "RATING-CLUBS-A: the 'Клубы' tab never fetches or fabricates a club score " +
    "— it renders a static, honest 'blocked pending business formula' card " +
    "(confirmed by schema/service audit: MonthlyRating/MonthlySalesInput/" +
    "MysteryShopperResult are all per-employee, no clubId column, no " +
    "groupBy-by-club anywhere in rating-calc.ts) — see the final report's " +
    "Rating section for the 2-3 proposed formulas awaiting product approval",
  skip,
  () => {},
);

test(
  "REGRESSION-C: PERSONAL/CLUB_MANAGER/CITY_MANAGER Home contexts remain " +
    "fully separate after every change in this round — no personal card ever " +
    "appears inside city_manager/club_manager kind, no management block ever " +
    "appears inside kind:'full' (already guaranteed at the type level, " +
    "re-verified by code review this round: home/page.tsx's four kind " +
    "branches are still mutually exclusive)",
  skip,
  () => {},
);
