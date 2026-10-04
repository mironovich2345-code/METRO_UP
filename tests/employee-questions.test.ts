import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";
import {
  MAX_QUESTION_ATTACHMENTS,
  canSendQuestionAs,
  canReadQuestion,
  canChangeQuestionStatus,
  shouldRevealAuthor,
  sanitizeQuestionForActor,
  isOwnQuestionAttachmentKey,
  questionAttachmentKeyPrefix,
  extForQuestionAttachmentMime,
  isQuestionSenderContext,
  resolveScopeFromCandidates,
  describeScopeResolutionError,
  INBOX_EXCLUDED_SENDER_ROLE,
  allowedStatusTransitions,
  contentDispositionForAttachment,
  isQuestionStatusValue,
  isQuestionCategoryValue,
  type QuestionRecordForSanitize,
  type QuestionScopeCandidate,
} from "../src/lib/server/questions/questions-core";
import { validateUpload, randomStorageKey, mediaKindForMime, MEDIA_RULES } from "../src/lib/storage/validation";

/**
 * METRO UP ROUND 1, Milestone 2A — Employee Questions backend foundation.
 *
 * questions-core.ts is pure (no Prisma/server-only import) and gets real,
 * exhaustive coverage below — every RBAC predicate (sender/read/status/
 * anonymity) and the attachment-ownership/validation rules. The actual
 * Prisma-touching service (questions-service.ts's createEmployeeQuestion/
 * getEmployeeQuestionForActor/listEmployeeQuestionsForActor/
 * updateEmployeeQuestionStatus/requestQuestionAttachmentUpload) requires a
 * live Postgres + configured S3-compatible storage — not available under
 * node:test, matching this repo's established convention — covered by
 * named, traceable skip stubs plus source-text structural checks for the
 * guarantees a live DB would otherwise verify at runtime.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoDb = { skip: "integration: requires Postgres + configured S3-compatible storage (not available under node:test)" } as const;

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "grant-1", role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return { userId: "user-1", appRole: "EMPLOYEE", accessStatus: null, onboardingCompleted: true, employeeClubId: null, grants: [], ...overrides };
}

/* ============================== creation: sender roles ============================== */

test("CREATE-A: MANAGER (plain employee, no special grant) may send as MANAGER", () => {
  assert.equal(canSendQuestionAs(actor(), "MANAGER"), true);
});

test("CREATE-B: CLUB_MANAGER grant holder may send as CLUB_MANAGER", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canSendQuestionAs(a, "CLUB_MANAGER"), true);
});

test("CREATE-B2: legacy AppRole=CLUB_MANAGER (no separate RoleAssignment grant) may also send as CLUB_MANAGER", () => {
  const a = actor({ appRole: "CLUB_MANAGER", grants: [] });
  assert.equal(canSendQuestionAs(a, "CLUB_MANAGER"), true);
});

test("CREATE-C: CITY_MANAGER grant holder may send as CITY_MANAGER", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(canSendQuestionAs(a, "CITY_MANAGER"), true);
});

test("CREATE-D: a plain employee (no CLUB_MANAGER/CITY_MANAGER grant) attempting to send as CLUB_MANAGER is denied", () => {
  assert.equal(canSendQuestionAs(actor(), "CLUB_MANAGER"), false);
});

test("CREATE-E: a plain employee attempting to send as CITY_MANAGER is denied", () => {
  assert.equal(canSendQuestionAs(actor(), "CITY_MANAGER"), false);
});

test("CREATE-F: a CLUB_MANAGER (no CITY_MANAGER grant) attempting to send as CITY_MANAGER is denied — 'invalid role denied'", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canSendQuestionAs(a, "CITY_MANAGER"), false);
});

test("CREATE-G: a REVOKED (SUSPENDED) CLUB_MANAGER grant no longer authorizes sending as CLUB_MANAGER", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1", status: "SUSPENDED" })] });
  assert.equal(canSendQuestionAs(a, "CLUB_MANAGER"), false);
});

test("CREATE-H: a CITY_MANAGER may ALSO choose to send as plain MANAGER — context is a choice among held authority, not a fixed single identity", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(canSendQuestionAs(a, "MANAGER"), true);
});

test("CREATE-I: isQuestionSenderContext correctly narrows only the three allowed values, rejecting anything else (e.g. a client sending role=OPERATIONS_DIRECTOR)", () => {
  assert.equal(isQuestionSenderContext("MANAGER"), true);
  assert.equal(isQuestionSenderContext("CLUB_MANAGER"), true);
  assert.equal(isQuestionSenderContext("CITY_MANAGER"), true);
  assert.equal(isQuestionSenderContext("OPERATIONS_DIRECTOR"), false);
  assert.equal(isQuestionSenderContext("PROJECT_ADMIN"), false);
  assert.equal(isQuestionSenderContext("ADMIN"), false);
});

test("CREATE-J: MAX_QUESTION_ATTACHMENTS is exactly 5, matching section 4", () => {
  assert.equal(MAX_QUESTION_ATTACHMENTS, 5);
});

/* ============================== scope resolution (Milestone 2B.1, section B) ============================== */
/* The audited gap: EmployeeProfile.cityId/clubId is the author's own
 * EMPLOYMENT location, not their management scope — a CLUB_MANAGER/
 * CITY_MANAGER may hold more than one active grant, and the one they are
 * ACTUALLY submitting under must come from a validated selection among
 * their REAL grants, never a blind EmployeeProfile read and never an
 * arbitrary "first grant" guess. resolveScopeFromCandidates is the pure
 * decision; questions-service.ts's buildClubManagerScopeCandidates/
 * buildCityManagerScopeCandidates (DB-touching, covered by source-text +
 * skip stubs below) supply the real candidate list. */

const cityA: QuestionScopeCandidate = { cityId: "city-A", cityName: "City A", clubId: null, clubName: null };
const cityB: QuestionScopeCandidate = { cityId: "city-B", cityName: "City B", clubId: null, clubName: null };

test("SCOPE-A: a CITY_MANAGER with two city grants, hint=city A, resolves to city A", () => {
  const result = resolveScopeFromCandidates([cityA, cityB], { cityId: "city-A" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.scope.cityId, "city-A");
});

test("SCOPE-B: the SAME actor with hint=city B resolves to city B — the hint, not grant order, decides", () => {
  const result = resolveScopeFromCandidates([cityA, cityB], { cityId: "city-B" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.scope.cityId, "city-B");
});

test("SCOPE-C: a forged city C (not among the actor's real candidates) is denied — invalid_scope_hint, never silently accepted or substituted", () => {
  const result = resolveScopeFromCandidates([cityA, cityB], { cityId: "city-C" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_scope_hint");
});

test("SCOPE-D: a revoked grant's city is no longer a candidate (the service layer only builds candidates from ACTIVE grants) — hinting it behaves exactly like a forged city: denied", () => {
  // Simulates: actor used to hold city-B, it was revoked, candidates now only [cityA].
  const result = resolveScopeFromCandidates([cityA], { cityId: "city-B" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid_scope_hint");
});

test("SCOPE-E: no scope hint with two ambiguous candidates is REJECTED — never silently selects candidates[0] ('do not invent arbitrary-first behavior')", () => {
  const result = resolveScopeFromCandidates([cityA, cityB], undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "ambiguous_scope");
});

test("SCOPE-F: exactly ONE candidate auto-resolves with no hint needed — not 'arbitrary-first', the only possible answer given real grants", () => {
  const result = resolveScopeFromCandidates([cityA], undefined);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.scope.cityId, "city-A");
});

test("SCOPE-G: zero candidates (defensive — canSendQuestionAs should already have rejected this) resolves to no_scope, never a crash", () => {
  const result = resolveScopeFromCandidates([], undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "no_scope");
});

test("SCOPE-H: a club-scoped hint matches by clubId, not cityId, even when a city-scoped candidate for the SAME city also exists — clubId takes precedence when both are present on the hint", () => {
  const clubCandidate: QuestionScopeCandidate = { cityId: "city-A", cityName: "City A", clubId: "club-1", clubName: "Club 1" };
  const result = resolveScopeFromCandidates([cityA, clubCandidate], { cityId: "city-A", clubId: "club-1" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.scope.clubId, "club-1");
});

test("SCOPE-I: describeScopeResolutionError returns a distinct, safe Russian message for each code — never a raw internal code string shown to the user", () => {
  const ambiguous = describeScopeResolutionError("ambiguous_scope");
  const invalid = describeScopeResolutionError("invalid_scope_hint");
  const none = describeScopeResolutionError("no_scope");
  assert.notEqual(ambiguous, invalid);
  assert.notEqual(invalid, none);
  for (const msg of [ambiguous, invalid, none]) {
    assert.doesNotMatch(msg, /ambiguous_scope|invalid_scope_hint|no_scope/);
  }
});

/* ============================== scope resolution: service wiring (source-text + skip stubs) ============================== */

test("SCOPE-WIRE-A: createEmployeeQuestion no longer derives CLUB_MANAGER/CITY_MANAGER scope from EmployeeProfile — only the MANAGER branch reads user.employeeProfile.cityId/clubId", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const managerBranchIdx = src.indexOf('if (input.senderContext === "MANAGER")');
  const elseBranchIdx = src.indexOf("} else {", managerBranchIdx);
  const elseBranchEnd = src.indexOf("\n  }\n", elseBranchIdx);
  const elseBranch = src.slice(elseBranchIdx, elseBranchEnd);
  assert.doesNotMatch(elseBranch, /user\.employeeProfile/);
  assert.match(elseBranch, /resolveScopeFromCandidates/);
});

test("SCOPE-WIRE-B: buildCityManagerScopeCandidates only includes ACTIVE CITY_MANAGER grants (isGrantActive filter present)", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(src.indexOf("async function buildCityManagerScopeCandidates"), src.indexOf("async function buildCityManagerScopeCandidates") + 800);
  assert.match(fnSrc, /isGrantActive\(g\)/);
});

test(
  "SCOPE-INT-A: a CITY_MANAGER with two ACTIVE city grants submitting with scopeHint={cityId: cityA} persists cityIdSnapshot=cityA; the same actor with scopeHint={cityId: cityB} persists cityB",
  skipNoDb,
  () => {},
);
test("SCOPE-INT-B: a CLUB_MANAGER managing two clubs must supply a matching scopeHint or the submission is rejected as ambiguous_scope", skipNoDb, () => {});
test("SCOPE-INT-C: a CITY_MANAGER with exactly one active grant and no hint auto-resolves and persists that grant's city/club", skipNoDb, () => {});

/* ============================== routing / read scope ============================== */

test("READ-A: the author can always read their own question, regardless of role/grants", () => {
  const a = actor({ userId: "author-1" });
  assert.equal(canReadQuestion(a, { authorUserId: "author-1", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("READ-B: PROJECT_ADMIN (hasSystemAccess) reads any question network-wide", () => {
  const a = actor({ appRole: "ADMIN" });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("READ-C: OPERATIONS_DIRECTOR reads any question network-wide — 'operations director visibility preparation'", () => {
  const a = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("READ-D: a CITY_MANAGER with a CITY-scoped grant covering the question's city reads it, even with a club snapshot present", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("READ-E: a CITY_MANAGER with a CLUB-scoped grant covering the question's specific club reads it", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("READ-F: a CITY_MANAGER scoped to a DIFFERENT city cannot read this question — 'CITY_MANAGER may not see questions from another city'", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-OTHER" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("READ-G: a CITY_MANAGER scoped to a DIFFERENT club (same city not granted city-wide) cannot read a question from another club", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CLUB", clubId: "club-OTHER" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("READ-H: a plain MANAGER/CLUB_MANAGER (no CITY_MANAGER/network authority) cannot read someone ELSE's question", () => {
  const a = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "someone-else", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("READ-I: a CITY_MANAGER question (clubIdSnapshot null) is readable only by a CITY-scoped grant covering that city — a CLUB-scoped grant can never cover a null-club question", () => {
  const cityScoped = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const clubScoped = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canReadQuestion(cityScoped, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: null }), true);
  assert.equal(canReadQuestion(clubScoped, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: null }), false);
});

test("READ-J: 'if no CITY_MANAGER is assigned, OPERATIONS_DIRECTOR must still see the question' — an actor with zero CITY_MANAGER grants but OPERATIONS_DIRECTOR authority still reads it", () => {
  const a = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(canReadQuestion(a, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

/* ============================== status mutation ============================== */

test("STATUS-A: a plain MANAGER may NEVER change status, even for their own question", () => {
  const a = actor({ userId: "author-1" });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "author-1", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("STATUS-B: a CLUB_MANAGER may NEVER change status, even for their own question", () => {
  const a = actor({ userId: "author-1", grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "club-1" })] });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "author-1", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("STATUS-C: a CITY_MANAGER covering the question's scope MAY change status (in-scope allowed)", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("STATUS-D: a CITY_MANAGER NOT covering the question's scope is denied (out-of-scope denied)", () => {
  const a = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-OTHER" })] });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

test("STATUS-E: OPERATIONS_DIRECTOR may change status for any question in the network", () => {
  const a = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("STATUS-F: PROJECT_ADMIN may change status for any question", () => {
  const a = actor({ appRole: "ADMIN" });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "x", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), true);
});

test("STATUS-G: a CITY_MANAGER filing their OWN question cannot change ITS status purely by being the author — authority must come from their grant covering the scope, not self-authorship (no special-casing exists for this)", () => {
  // Scoped to a DIFFERENT city than their own question's snapshot — denied,
  // proving self-authorship alone grants nothing here (unlike canReadQuestion).
  const a = actor({ userId: "cm-1", grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-OTHER" })] });
  assert.equal(canChangeQuestionStatus(a, { authorUserId: "cm-1", cityIdSnapshot: "city-1", clubIdSnapshot: "club-1" }), false);
});

/* ============================== anonymity (SECURITY CRITICAL) ============================== */

test("ANON-A: a non-anonymous question reveals the author to anyone otherwise authorized to read it", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(shouldRevealAuthor(cm, { authorUserId: "x", anonymous: false }), true);
});

test("ANON-B: CITY_MANAGER never receives the real author identity for an anonymous question", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  assert.equal(shouldRevealAuthor(cm, { authorUserId: "x", anonymous: true }), false);
});

test("ANON-C: OPERATIONS_DIRECTOR never receives the real author identity for an anonymous question", () => {
  const od = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assert.equal(shouldRevealAuthor(od, { authorUserId: "x", anonymous: true }), false);
});

test("ANON-D: PROJECT_ADMIN DOES see the real author even for an anonymous question (moderation/abuse investigation)", () => {
  const admin = actor({ appRole: "ADMIN" });
  assert.equal(shouldRevealAuthor(admin, { authorUserId: "x", anonymous: true }), true);
});

test("ANON-E: the author themselves always sees their own identity, anonymous or not", () => {
  const a = actor({ userId: "author-1" });
  assert.equal(shouldRevealAuthor(a, { authorUserId: "author-1", anonymous: true }), true);
});

const sanitizeRecord = (overrides: Partial<QuestionRecordForSanitize> = {}): QuestionRecordForSanitize => ({
  id: "q-1",
  category: "TRAINING",
  text: "Когда следующее обучение?",
  anonymous: true,
  status: "NEW",
  authorUserId: "author-1",
  authorDisplayName: "Ева Губанкова",
  senderRole: "MANAGER",
  cityNameSnapshot: "Екатеринбург",
  clubNameSnapshot: "Полтавская",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  attachments: [],
  ...overrides,
});

/**
 * METRO UP ROUND 1, Milestone 2A.1 — anonymous DTO hardening. authorUserId
 * must be genuinely ABSENT (no own property at all) from the serialized
 * object for CITY_MANAGER/OPERATIONS_DIRECTOR on an anonymous question —
 * not present with value null, not present with value undefined. Checked
 * three independent ways per the spec: hasOwnProperty, `in`, and a
 * JSON.stringify substring search (catches a hypothetical future regression
 * that reintroduces the key via spread/default even if a hasOwnProperty
 * check elsewhere were accidentally skipped).
 */

test("ANON-DTO-A: CITY_MANAGER's sanitized DTO for an anonymous question has NO 'authorUserId' own property at all (not null, not undefined-but-present)", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Анонимный сотрудник");
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), false);
  assert.equal("authorUserId" in dto, false);
  assert.doesNotMatch(JSON.stringify(dto), /authorUserId/);
  assert.doesNotMatch(JSON.stringify(dto), /author-1/); // the real id itself must not appear anywhere in the payload
});

test("ANON-DTO-B: OPERATIONS_DIRECTOR's sanitized DTO for an anonymous question also has NO 'authorUserId' own property", () => {
  const od = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  const dto = sanitizeQuestionForActor(od, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Анонимный сотрудник");
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), false);
  assert.equal("authorUserId" in dto, false);
  assert.doesNotMatch(JSON.stringify(dto), /authorUserId/);
  assert.doesNotMatch(JSON.stringify(dto), /author-1/);
});

test("ANON-DTO-C: PROJECT_ADMIN's sanitized DTO DOES have an own 'authorUserId' property with the real id, even when anonymous=true", () => {
  const admin = actor({ appRole: "ADMIN" });
  const dto = sanitizeQuestionForActor(admin, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Ева Губанкова");
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), true);
  assert.equal(dto.authorUserId, "author-1");
  assert.match(JSON.stringify(dto), /"authorUserId":"author-1"/);
});

test("ANON-DTO-D: a NON-anonymous question shows the real author (own property present) to an authorized CITY_MANAGER", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord({ anonymous: false }));
  assert.equal(dto.authorDisplay, "Ева Губанкова");
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), true);
  assert.equal(dto.authorUserId, "author-1");
});

test("ANON-DTO-D2: the author themselves sees their own 'authorUserId' as an own property on their own anonymous question", () => {
  const selfAuthor = actor({ userId: "author-1" });
  const dto = sanitizeQuestionForActor(selfAuthor, sanitizeRecord());
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), true);
  assert.equal(dto.authorUserId, "author-1");
});

test("ANON-DTO-E: no accidental telegramId/avatar/username/phone leak — the sanitized DTO's OWN keys are EXACTLY the documented safe set when hidden (authorUserId absent) and the safe set plus authorUserId when revealed, nothing extra ever", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const baseKeys = ["id", "category", "text", "anonymous", "status", "authorDisplay", "senderRole", "cityName", "clubName", "createdAt", "updatedAt", "attachments"];

  const hiddenDto = sanitizeQuestionForActor(cm, sanitizeRecord());
  assert.deepEqual(Object.keys(hiddenDto).sort(), [...baseKeys].sort());

  const revealedDto = sanitizeQuestionForActor(cm, sanitizeRecord({ anonymous: false }));
  assert.deepEqual(Object.keys(revealedDto).sort(), [...baseKeys, "authorUserId"].sort());

  for (const forbidden of ["telegramId", "telegramUsername", "username", "avatarUrl", "avatarStorageKey", "phone", "photoUrl"]) {
    assert.doesNotMatch(JSON.stringify(hiddenDto), new RegExp(forbidden));
    assert.doesNotMatch(JSON.stringify(revealedDto), new RegExp(forbidden));
  }
});

test("ANON-DTO-F: city/club routing metadata remains visible even on an anonymous question — 'CITY/CLUB routing metadata may remain visible'", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord());
  assert.equal(dto.cityName, "Екатеринбург");
  assert.equal(dto.clubName, "Полтавская");
});

test("ANON-DTO-G: attachments are summarized by display metadata only — no storageKey anywhere on the sanitized DTO", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(
    cm,
    sanitizeRecord({ attachments: [{ id: "att-1", originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }] }),
  );
  assert.equal(dto.attachments.length, 1);
  assert.deepEqual(Object.keys(dto.attachments[0]).sort(), ["id", "mimeType", "originalName", "sizeBytes"]);
});

/* ============================== attachments: storage rule + ownership ============================== */

test("ATT-A: a valid image (jpeg/png/webp) is accepted within the 10 MB ceiling", () => {
  for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
    assert.deepEqual(validateUpload("QUESTION_ATTACHMENT", mime, 2_000_000), { ok: true });
  }
});

test("ATT-B: a valid PDF is accepted within the 10 MB ceiling", () => {
  assert.deepEqual(validateUpload("QUESTION_ATTACHMENT", "application/pdf", 2_000_000), { ok: true });
});

test("ATT-C: an executable/disguised file (e.g. application/x-msdownload, text/html) is rejected", () => {
  for (const mime of ["application/x-msdownload", "text/html", "application/javascript"]) {
    const result = validateUpload("QUESTION_ATTACHMENT", mime, 1000);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "UNSUPPORTED_MIME");
  }
});

test("ATT-D: a file over 10 MB is rejected", () => {
  const result = validateUpload("QUESTION_ATTACHMENT", "application/pdf", 11 * 1024 * 1024);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "FILE_TOO_LARGE");
});

test("ATT-E: MEDIA_RULES.QUESTION_ATTACHMENT's ceiling is exactly 10 MB, matching section 4", () => {
  assert.equal(MEDIA_RULES.QUESTION_ATTACHMENT.maxBytes, 10 * 1024 * 1024);
});

test("ATT-F: randomStorageKey for QUESTION_ATTACHMENT uses the 'questions/' prefix", () => {
  const key = randomStorageKey("QUESTION_ATTACHMENT", "application/pdf");
  assert.match(key, /^questions\/[0-9a-f-]+\.pdf$/);
});

test("ATT-G: mediaKindForMime (the generic admin media-upload auto-detector) never returns QUESTION_ATTACHMENT — question attachments have their own dedicated, non-MediaAsset upload path", () => {
  for (const mime of ["video/mp4", "image/jpeg", "application/pdf"]) {
    assert.notEqual(mediaKindForMime(mime), "QUESTION_ATTACHMENT");
  }
});

test("ATT-OWN-A: a user's own freshly-issued attachment key is recognized as their own", () => {
  const key = `${questionAttachmentKeyPrefix("user-1")}abc.jpg`;
  assert.equal(isOwnQuestionAttachmentKey("user-1", key), true);
});

test("ATT-OWN-B: user A can never submit user B's attachment key as their own — 'foreign storage key rejected'", () => {
  const key = `${questionAttachmentKeyPrefix("user-B")}abc.jpg`;
  assert.equal(isOwnQuestionAttachmentKey("user-A", key), false);
});

test("ATT-OWN-C: a key under a completely different namespace (e.g. an avatar key) is never mistaken for a question attachment key", () => {
  assert.equal(isOwnQuestionAttachmentKey("user-1", "avatars/user-1/abc.jpg"), false);
});

test("ATT-OWN-D: extForQuestionAttachmentMime maps every allowed mime, including application/pdf, and falls back safely otherwise", () => {
  assert.equal(extForQuestionAttachmentMime("application/pdf"), "pdf");
  assert.equal(extForQuestionAttachmentMime("image/webp"), "webp");
  assert.equal(extForQuestionAttachmentMime("application/octet-stream"), "bin");
});

/* ============================== security (source-text) ============================== */

test("SEC-A: both question API routes derive the acting user from the session (requireActiveAccess) and never accept a client-supplied userId", () => {
  for (const file of ["src/app/api/questions/route.ts", "src/app/api/questions/attachments/upload-url/route.ts"]) {
    const src = read(file);
    assert.match(src, /requireActiveAccess\(\)/, `${file} must derive identity from the session`);
    assert.doesNotMatch(src, /body\.userId|params\.userId|searchParams\.get\(.userId.\)/, `${file} must never accept a client-supplied userId`);
  }
});

test("SEC-B: the create-question request schema has no TOP-LEVEL cityId/clubId/authorUserId field — authorUserId is absent entirely; cityId/clubId exist ONLY nested inside the optional scopeHint selector (Milestone 2B.1, section B), never as a direct, trusted field", () => {
  const src = read("src/lib/server/schemas.ts");
  const schemaSrc = src.slice(src.indexOf("export const createQuestionSchema"), src.indexOf("export type CreateQuestionSchemaInput"));
  assert.doesNotMatch(schemaSrc, /authorUserId/);
  // cityId:/clubId: (actual field keys, not prose) must appear ONLY inside
  // the scopeHint object, never as a sibling of senderContext/category/
  // text/anonymous/attachments. Comment lines that MENTION cityId/clubId in
  // prose (explaining why the field is scoped this way) are expected — only
  // a real `fieldName:` key before scopeHint would indicate a regression.
  const beforeScopeHint = schemaSrc.slice(0, schemaSrc.indexOf("scopeHint:"));
  assert.doesNotMatch(beforeScopeHint, /\n\s*(cityId|clubId):/);
  assert.match(schemaSrc, /scopeHint: z\.object\(\{ cityId:.*clubId:.*\}\)\.optional\(\)/);
});

test("SEC-C: createEmployeeQuestion derives cityId/clubId from the actor's OWN EmployeeProfile, never from the request input", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function createEmployeeQuestion"), src.indexOf("export async function createEmployeeQuestion") + 2500);
  assert.match(fnSrc, /user\.employeeProfile\.cityId/);
  assert.match(fnSrc, /user\.employeeProfile\.clubId/);
  assert.doesNotMatch(fnSrc, /input\.cityId|input\.clubId/);
});

test("SEC-D: createEmployeeQuestion verifies EVERY attachment's ownership and real mime/size BEFORE the DB transaction — never inside it (no slow network I/O while holding a DB transaction open)", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const verifyIdx = src.indexOf("isOwnQuestionAttachmentKey(user.id");
  const txIdx = src.indexOf("prisma.$transaction");
  assert.ok(verifyIdx > 0 && txIdx > verifyIdx, "expected attachment verification before the transaction");
});

test("SEC-E: the audit metadata for QUESTION_CREATED never includes the question's text content — category/anonymity/senderRole/attachmentCount only", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const metadataIdx = src.indexOf("metadata: { category:");
  const metadataLiteral = src.slice(metadataIdx, src.indexOf("},", metadataIdx));
  assert.doesNotMatch(metadataLiteral, /\btext\b/);
  assert.match(metadataLiteral, /category/);
  assert.match(metadataLiteral, /attachmentCount/);
});

test("SEC-F: updateEmployeeQuestionStatus checks canChangeQuestionStatus BEFORE writing anything", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnStart = src.indexOf("export async function updateEmployeeQuestionStatus");
  const checkIdx = src.indexOf("canChangeQuestionStatus(actor", fnStart);
  const updateIdx = src.indexOf("tx.employeeQuestion.update", fnStart);
  assert.ok(checkIdx > fnStart && updateIdx > checkIdx, "expected the authorization check before any write");
});

/* ============================== schema (additive) ============================== */

test("SCHEMA-A: EmployeeQuestion/EmployeeQuestionAttachment models exist with the documented fields", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model EmployeeQuestion \{/);
  assert.match(schema, /model EmployeeQuestionAttachment \{/);
  assert.match(schema, /cityIdSnapshot\s+String\b/);
  assert.match(schema, /clubIdSnapshot\s+String\?/);
});

test("SCHEMA-B: the migration only creates new types/tables/columns — never drops or destructively alters an existing one", () => {
  const migration = read("prisma/migrations/20261002000000_employee_questions/migration.sql");
  assert.match(migration, /CREATE TABLE "employee_questions"/);
  assert.match(migration, /CREATE TABLE "employee_question_attachments"/);
  assert.match(migration, /ALTER TYPE "AuditAction" ADD VALUE/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DROP TYPE/i);
});

test("SCHEMA-C: AuditAction gained QUESTION_CREATED and QUESTION_STATUS_CHANGED, additively", () => {
  const schema = read("prisma/schema.prisma");
  const enumSrc = schema.slice(schema.indexOf("enum AuditAction"), schema.indexOf("enum AuditAction") + 400);
  assert.match(enumSrc, /QUESTION_CREATED/);
  assert.match(enumSrc, /QUESTION_STATUS_CHANGED/);
  assert.match(enumSrc, /MEDIA_UPLOAD/); // pre-existing value still present
});

/* ===================== DB/storage-dependent integration (traceable skip stubs) ===================== */

test("INT-A: a MANAGER's created question persists with the correct city/club snapshot from their EmployeeProfile at submission time", skipNoDb, () => {});
test("INT-B: a later employee transfer (EmployeeProfile.clubId change) does NOT retroactively change an already-created question's snapshot", skipNoDb, () => {});
test("INT-C: listEmployeeQuestionsForActor issues exactly ONE Prisma query regardless of how many CITY_MANAGER grants the actor holds (no N+1)", skipNoDb, () => {});
test("INT-D: a CITY_MANAGER with BOTH a CITY-scoped and a CLUB-scoped grant (different cities) sees questions from both via the single OR query", skipNoDb, () => {});
test("INT-E: unauthorized attachment access is denied — retrieving a question's attachment the caller cannot read the question for fails", skipNoDb, () => {});
test("INT-F: a submission with 6 attachments is rejected (too_many_attachments) before any DB write", skipNoDb, () => {});
test("INT-G: QUESTION_CREATED and QUESTION_STATUS_CHANGED audit rows are actually written with actor/entity/old-status/new-status/timestamp", skipNoDb, () => {});
test("INT-H: an idempotent status update (new status === current status) does not write a redundant audit row", skipNoDb, () => {});

/* ===================================================================== *
 *  METRO UP ROUND 1, MILESTONE 3 — CITY_MANAGER Questions Inbox
 * ===================================================================== */

/* ============================== inbox routing exclusion ============================== */

test("M3-INBOX-A: the inbox routing-rule constant excludes exactly CITY_MANAGER — the routing rule is 'MANAGER/CLUB_MANAGER -> CITY_MANAGER(s) -> OPERATIONS_DIRECTOR; a CITY_MANAGER's own question -> OPERATIONS_DIRECTOR only'", () => {
  assert.equal(INBOX_EXCLUDED_SENDER_ROLE, "CITY_MANAGER");
});

/* ============================== status transitions (UI guidance, pure) ============================== */

test("TRANS-A: NEW's forward step is IN_PROGRESS, no correction step yet", () => {
  assert.deepEqual(allowedStatusTransitions("NEW"), { forward: "IN_PROGRESS", correction: null });
});

test("TRANS-B: IN_PROGRESS's forward step is CLOSED; its correction step is back to NEW", () => {
  assert.deepEqual(allowedStatusTransitions("IN_PROGRESS"), { forward: "CLOSED", correction: "NEW" });
});

test("TRANS-C: CLOSED has no forward step; its correction step is back to IN_PROGRESS — not hardcoded as one-way", () => {
  assert.deepEqual(allowedStatusTransitions("CLOSED"), { forward: null, correction: "IN_PROGRESS" });
});

/* ============================== list query-param validators ============================== */

test("QVAL-A: isQuestionStatusValue accepts exactly the three real statuses and rejects anything else, including the client's own 'ALL' sentinel (absence, not the string 'ALL', means no filter)", () => {
  for (const s of ["NEW", "IN_PROGRESS", "CLOSED"]) assert.equal(isQuestionStatusValue(s), true);
  assert.equal(isQuestionStatusValue("ALL"), false);
  assert.equal(isQuestionStatusValue("DELETED"), false);
  assert.equal(isQuestionStatusValue(""), false);
});

test("QVAL-B: isQuestionCategoryValue accepts exactly the seven real categories and rejects garbage", () => {
  for (const c of ["WORK_PROCESSES", "TRAINING", "MANAGEMENT", "WORKING_CONDITIONS", "TECHNICAL", "IDEA", "OTHER"]) {
    assert.equal(isQuestionCategoryValue(c), true);
  }
  assert.equal(isQuestionCategoryValue("NOT_A_CATEGORY"), false);
});

/* ============================== attachment download: Content-Disposition (pure) ============================== */

test("CD-A: an image attachment gets 'inline' disposition (preview may be shown)", () => {
  assert.match(contentDispositionForAttachment("photo.jpg", "image/jpeg"), /^inline;/);
});

test("CD-B: a PDF attachment gets 'inline' disposition (safe open action)", () => {
  assert.match(contentDispositionForAttachment("report.pdf", "application/pdf"), /^inline;/);
});

test("CD-C: any other mime type falls back to 'attachment' disposition", () => {
  assert.match(contentDispositionForAttachment("file.bin", "application/octet-stream"), /^attachment;/);
});

test("CD-D: CR/LF and double quotes in the original (user-controlled) filename are stripped — header injection defense", () => {
  const header = contentDispositionForAttachment('evil"\r\nX-Injected: 1', "image/png");
  assert.doesNotMatch(header, /\r|\n/);
  assert.doesNotMatch(header, /"evil"/);
});

test("CD-E: a Cyrillic filename survives via the RFC 5987 UTF-8 form, alongside a safe ASCII fallback", () => {
  const header = contentDispositionForAttachment("фото.jpg", "image/jpeg");
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/);
  assert.ok(encoded, "expected an RFC 5987 filename* form");
  assert.equal(decodeURIComponent(encoded![1]), "фото.jpg");
  assert.match(header, /filename="_+\.jpg"/);
});

test("CD-F: the header is built only from originalName/mimeType — it never contains a storage-path-shaped segment", () => {
  assert.doesNotMatch(contentDispositionForAttachment("report.pdf", "application/pdf"), /questions\//);
});

/* ============================== Milestone 3: city manager inbox scope (source-text) ============================== */

test("M3-SCOPE-A: listEmployeeQuestionsForActor's CITY_MANAGER branch excludes INBOX_EXCLUDED_SENDER_ROLE — 'own outgoing CITY_MANAGER question not in employee inbox', and this excludes it for every CITY_MANAGER, not just the author", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function listEmployeeQuestionsForActor"),
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
  );
  assert.match(fnSrc, /senderRole: \{ not: INBOX_EXCLUDED_SENDER_ROLE \}/);
});

test("M3-SCOPE-B: the inbox list and the Home 'new' count both build their scope from the SAME buildCityManagerScopeOr helper — they can never silently disagree", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const matches = src.match(/buildCityManagerScopeOr\(actor\)/g) ?? [];
  assert.ok(matches.length >= 2, "expected buildCityManagerScopeOr to be called from both the list and the count functions");
});

test("M3-SCOPE-C: buildCityManagerScopeOr only includes ACTIVE CITY_MANAGER grants — a revoked grant is excluded from the very next request's scope (no caching of a stale grant set)", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(src.indexOf("function buildCityManagerScopeOr"), src.indexOf("function buildCityManagerScopeOr") + 900);
  assert.match(fnSrc, /isGrantActive\(g\)/);
});

test("M3-SCOPE-D: PROJECT_ADMIN/OPERATIONS_DIRECTOR (hasSystemAccess/hasNetworkAccess) are NOT subject to the senderRole exclusion — a CITY_MANAGER's own outgoing question IS addressed to them and must remain visible in their inbox", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function listEmployeeQuestionsForActor"),
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
  );
  const sysBranchIdx = fnSrc.indexOf("hasSystemAccess(actor) || hasNetworkAccess(actor)");
  const sysBranchBlock = fnSrc.slice(sysBranchIdx, fnSrc.indexOf("} else {", sysBranchIdx));
  assert.doesNotMatch(sysBranchBlock, /INBOX_EXCLUDED_SENDER_ROLE/);
});

test("M3-SCOPE-E: listEmployeeQuestionsForActor paginates with bounded page/limit (skip/take), audit-service.ts's own convention, and returns a total count alongside the rows", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function listEmployeeQuestionsForActor"),
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
  );
  assert.match(fnSrc, /skip: \(page - 1\) \* limit/);
  assert.match(fnSrc, /take: limit/);
  assert.match(fnSrc, /prisma\.employeeQuestion\.count\(/);
});

test("M3-SCOPE-F: countNewEmployeeQuestionsForCityManager (the Home block's number) is a single COUNT query — never a findMany — filtered to status NEW plus the same inbox senderRole exclusion", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
    src.indexOf("/* ============================== status mutation"),
  );
  assert.match(fnSrc, /prisma\.employeeQuestion\.count\(/);
  assert.doesNotMatch(fnSrc, /findMany/);
  assert.match(fnSrc, /status: "NEW"/);
  assert.match(fnSrc, /INBOX_EXCLUDED_SENDER_ROLE/);
});

test("M3-SCOPE-G: countNewEmployeeQuestionsForCityManager returns 0 rather than throwing when the actor has no active CITY_MANAGER scope at all", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
    src.indexOf("/* ============================== status mutation"),
  );
  assert.match(fnSrc, /if \(!scopeOr\) return 0;/);
});

test(
  "M3-SCOPE-INT-A: a CITY_MANAGER with an active City A grant sees only City A's questions; the same actor re-granted City B instead sees only City B's — 'switching' is simply the actor's current active grant set at request time",
  skipNoDb,
  () => {},
);
test("M3-SCOPE-INT-B: a question from a city the actor does NOT manage never appears in their inbox (foreign city hidden)", skipNoDb, () => {});
test("M3-SCOPE-INT-C: a revoked CITY_MANAGER grant's former city disappears from the inbox on the very next request", skipNoDb, () => {});
test("M3-SCOPE-INT-D: a CITY_MANAGER's own senderRole=CITY_MANAGER question never appears in ANY CITY_MANAGER's inbox, including a peer whose scope happens to overlap", skipNoDb, () => {});

/* ============================== Milestone 3: anonymity re-verified at the inbox boundary ============================== */

test("M3-ANON-A: listEmployeeQuestionsForActor's rows are mapped through sanitizeQuestionForActor — the list endpoint never bypasses anonymity sanitization", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function listEmployeeQuestionsForActor"),
    src.indexOf("export async function countNewEmployeeQuestionsForCityManager"),
  );
  assert.match(fnSrc, /questions: rows\.map\(\(r\) => sanitizeQuestionForActor\(actor, toSanitizeInput\(r\)\)\)/);
});

test("M3-ANON-B: simulating the list endpoint — mapping sanitizeQuestionForActor over a batch of anonymous rows for a CITY_MANAGER viewer never leaks authorUserId on ANY row (the 'anonymous list DTO' guarantee)", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const rows = [sanitizeRecord({ id: "q-1" }), sanitizeRecord({ id: "q-2", authorUserId: "author-2" })];
  const dtos = rows.map((r) => sanitizeQuestionForActor(cm, r));
  for (const dto of dtos) {
    assert.equal(dto.authorDisplay, "Анонимный сотрудник");
    assert.equal("authorUserId" in dto, false);
  }
});

test("M3-ANON-C: getEmployeeQuestionForActor (detail) sanitizes through the EXACT same function as the list — the 'anonymous detail DTO' guarantee can never drift from the list's", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function getEmployeeQuestionForActor"),
    src.indexOf("export async function getQuestionAttachmentForDownload"),
  );
  assert.match(fnSrc, /sanitizeQuestionForActor\(actor, toSanitizeInput\(question\)\)/);
});

test("M3-ANON-D: PROJECT_ADMIN's list-simulated DTO still reveals the real author (unchanged from Milestone 2A.1) — Milestone 3 did not weaken this", () => {
  const admin = actor({ appRole: "ADMIN" });
  const dtos = [sanitizeRecord()].map((r) => sanitizeQuestionForActor(admin, r));
  assert.equal(dtos[0].authorUserId, "author-1");
});

test("M3-ANON-E: EmployeeQuestionDTO carries no avatar-shaped key at all — there is nothing avatar-like for the inbox UI to render for an anonymous author even by mistake", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord());
  const keys = Object.keys(dto).join(",");
  for (const forbidden of ["avatar", "Avatar", "photo", "Photo", "initials"]) {
    assert.doesNotMatch(keys, new RegExp(forbidden));
  }
});

/* ============================== Milestone 3: status route wiring ============================== */

test("M3-STATUS-A: PATCH /api/questions/[id] reuses updateEmployeeQuestionStatus unchanged — the in-scope-allowed/foreign-denied/manager-denied guarantees already proven by STATUS-A..G above apply to this route verbatim", () => {
  const src = read("src/app/api/questions/[id]/route.ts");
  assert.match(src, /updateEmployeeQuestionStatus\(actor, id, body\.status\)/);
});

test("M3-STATUS-B: the status update schema accepts exactly the three real statuses — no client-invented value", () => {
  const src = read("src/lib/server/schemas.ts");
  const schemaSrc = src.slice(src.indexOf("export const updateQuestionStatusSchema"), src.indexOf("export type UpdateQuestionStatusInput"));
  assert.match(schemaSrc, /z\.enum\(\["NEW", "IN_PROGRESS", "CLOSED"\]\)/);
});

test("M3-STATUS-C: updateEmployeeQuestionStatus is NOT a one-way state machine — no transition-restriction branch was added; allowedStatusTransitions only shapes which buttons the UI suggests", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function updateEmployeeQuestionStatus"), src.indexOf("export async function updateEmployeeQuestionStatus") + 1200);
  assert.doesNotMatch(fnSrc, /invalid.*transition/i);
});

/* ============================== Milestone 3: attachment download proxy ============================== */

test("M3-ATT-A: getQuestionAttachmentForDownload authorizes via canReadQuestion BEFORE returning any metadata — a foreign CITY_MANAGER gets a 403, never the storageKey", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(
    src.indexOf("export async function getQuestionAttachmentForDownload"),
    src.indexOf("export interface ListQuestionsFilter"),
  );
  const checkIdx = fnSrc.indexOf("canReadQuestion(actor");
  const returnIdx = fnSrc.indexOf("return { storageKey");
  assert.ok(checkIdx > 0 && returnIdx > checkIdx, "expected the authorization check before the metadata is ever returned");
});

test("M3-ATT-B: attachment lookup is strictly by attachmentId (an opaque Prisma id from the URL path) — never a raw storageKey accepted from the client ('raw storageKey cannot be used to fetch an arbitrary object')", () => {
  const routeSrc = read("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  assert.doesNotMatch(routeSrc, /searchParams\.get\(.storageKey.\)|body\.storageKey|params\.storageKey/);
  const serviceSrc = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = serviceSrc.slice(
    serviceSrc.indexOf("export async function getQuestionAttachmentForDownload"),
    serviceSrc.indexOf("export interface ListQuestionsFilter"),
  );
  assert.match(fnSrc, /where: \{ id: attachmentId \}/);
});

test("M3-ATT-C: the signed download URL's TTL is short and explicit (60s) — never the storage provider's longer 300s default used elsewhere for admin documents ('signed URL expiry bounded')", () => {
  const src = read("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  assert.match(src, /createSignedDownloadUrl\(meta\.storageKey, 60\)/);
});

test("M3-ATT-D: storageKey is referenced in the route EXACTLY once — passed straight into createSignedDownloadUrl, never echoed into the Response headers/body ('no author identity leak through returned attachment metadata')", () => {
  const src = read("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  const occurrences = src.match(/meta\.storageKey/g) ?? [];
  assert.equal(occurrences.length, 1);
  assert.match(src, /createSignedDownloadUrl\(meta\.storageKey, 60\)/);
  // Property ACCESS, not prose — the route's own docstring explains the
  // identity-leak finding using the word "authorUserId" in passing, which a
  // bare-word check would wrongly flag; `.authorUserId` (an actual property
  // read) never appears anywhere in this route.
  assert.doesNotMatch(src, /\.authorUserId\b/);
});

test("M3-ATT-E: the download route authenticates via requireActiveAccess + a freshly-resolved ActorContext every request — never a cached/client-asserted role", () => {
  const src = read("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  assert.match(src, /requireActiveAccess\(\)/);
  assert.match(src, /getActorContext\(user\)/);
});

test("M3-ATT-INT-A: an authorized question viewer (the covering CITY_MANAGER) can retrieve the attachment; a foreign CITY_MANAGER is denied", skipNoDb, () => {});
test("M3-ATT-INT-B: a guessed/leaked real storageKey cannot be fetched through this route by any means other than its owning attachment's id", skipNoDb, () => {});

/* ============================== Milestone 3: Home "N новых" count ============================== */

test("M3-HOME-A: the Home city-manager block wires questionsNewCount from countNewEmployeeQuestionsForCityManager — same scope/exclusion guarantees as the inbox list (M3-SCOPE-B/F)", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  assert.match(src, /countNewEmployeeQuestionsForCityManager\(actor\)/);
  assert.match(src, /questionsNewCount/);
});

test("M3-HOME-INT-A: a CITY_MANAGER's Home 'N новых' count matches QuestionStatus.NEW rows within their active scope, excluding their own outgoing CITY_MANAGER questions", skipNoDb, () => {});

/* ============================== Milestone 3: list/detail/attachment route auth wiring ============================== */

test("M3-SEC-A: the list/detail/attachment-download routes all derive identity from the session (requireActiveAccess) and never accept a client-supplied userId", () => {
  for (const file of [
    "src/app/api/questions/route.ts",
    "src/app/api/questions/[id]/route.ts",
    "src/app/api/questions/attachments/[attachmentId]/download/route.ts",
  ]) {
    const src = read(file);
    assert.match(src, /requireActiveAccess\(\)/, `${file} must derive identity from the session`);
    assert.doesNotMatch(src, /body\.userId|searchParams\.get\(.userId.\)/, `${file} must never accept a client-supplied userId`);
  }
});

test("M3-SEC-B: GET /api/questions never passes an unvalidated status/category string straight into the service — isQuestionStatusValue/isQuestionCategoryValue gate both", () => {
  const src = read("src/app/api/questions/route.ts");
  assert.match(src, /isQuestionStatusValue\(statusParam\)/);
  assert.match(src, /isQuestionCategoryValue\(categoryParam\)/);
});
