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
  type QuestionRecordForSanitize,
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

test("ANON-DTO-A: CITY_MANAGER's sanitized DTO for an anonymous question shows 'Анонимный сотрудник' and a null authorUserId", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Анонимный сотрудник");
  assert.equal(dto.authorUserId, null);
});

test("ANON-DTO-B: OPERATIONS_DIRECTOR's sanitized DTO for an anonymous question also hides identity", () => {
  const od = actor({ grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  const dto = sanitizeQuestionForActor(od, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Анонимный сотрудник");
  assert.equal(dto.authorUserId, null);
});

test("ANON-DTO-C: PROJECT_ADMIN's sanitized DTO includes the real author name and id even when anonymous=true", () => {
  const admin = actor({ appRole: "ADMIN" });
  const dto = sanitizeQuestionForActor(admin, sanitizeRecord());
  assert.equal(dto.authorDisplay, "Ева Губанкова");
  assert.equal(dto.authorUserId, "author-1");
});

test("ANON-DTO-D: a NON-anonymous question shows the real author to an authorized CITY_MANAGER", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord({ anonymous: false }));
  assert.equal(dto.authorDisplay, "Ева Губанкова");
  assert.equal(dto.authorUserId, "author-1");
});

test("ANON-DTO-E: no accidental telegramId/avatar/username/phone leak — the sanitized DTO's keys are EXACTLY the documented safe set, nothing extra", () => {
  const cm = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: "city-1" })] });
  const dto = sanitizeQuestionForActor(cm, sanitizeRecord());
  const allowedKeys = new Set([
    "id", "category", "text", "anonymous", "status", "authorDisplay", "authorUserId",
    "senderRole", "cityName", "clubName", "createdAt", "updatedAt", "attachments",
  ]);
  for (const key of Object.keys(dto)) {
    assert.ok(allowedKeys.has(key), `unexpected field on sanitized DTO: ${key}`);
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

test("SEC-B: the create-question request schema has no cityId/clubId/authorUserId field at all — the client cannot even SHAPE a request claiming routing metadata (section 5's anti-spoofing requirement)", () => {
  const src = read("src/lib/server/schemas.ts");
  const schemaSrc = src.slice(src.indexOf("export const createQuestionSchema"), src.indexOf("export type CreateQuestionSchemaInput"));
  assert.doesNotMatch(schemaSrc, /cityId|clubId|authorUserId/);
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
