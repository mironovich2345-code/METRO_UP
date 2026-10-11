import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildQuestionContextOptions,
  canSendQuestionAs,
  collapseToCityCandidates,
  describeScopeResolutionError,
  isLeadershipViewer,
  resolveScopeFromCandidates,
  sanitizeQuestionForActor,
  scopeResolutionHttpStatus,
  shouldRevealAuthor,
  contentDispositionForAttachment,
  type QuestionRecordForSanitize,
  type QuestionScopeCandidate,
} from "../src/lib/server/questions/questions-core";
import { buildQuestionNotificationText } from "../src/lib/server/notifications/notification-core";
import { buildCreateQuestionPayload, isSubmitDisabled, resolveQuestionScopeSelection } from "../src/lib/client/ask-question-core";
import { CACHE_SCHEMA_VERSION } from "../src/lib/client/persistent-cache-core";
import type { ActorContext, RoleGrant } from "../src/lib/server/rbac/types";

const read = (p: string) => readFileSync(p, "utf8");
/** Source without comments — "must not contain" checks look at code only. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return { id: "g", role: "MANAGER", scopeType: "CLUB", cityId: null, clubId: null, status: "ACTIVE", ...overrides };
}
function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return { userId: "viewer", appRole: "EMPLOYEE", accessStatus: "FULL", onboardingCompleted: true, employeeClubId: null, grants: [], ...overrides };
}

const NN = "nizhny";
const DZ = "dzerzhinsk";
const club = (clubId: string, cityId: string, clubName = clubId, cityName = cityId): QuestionScopeCandidate => ({ cityId, cityName, clubId, clubName });
const city = (cityId: string, cityName = cityId): QuestionScopeCandidate => ({ cityId, cityName, clubId: null, clubName: null });

/* ===================================================================== *
 *  QA-04.2 — question context resolution
 *
 *  Root cause (reproduced here): a CITY_MANAGER holding two city grants
 *  (Нижний Новгород + Дзержинск) — or a CITY grant plus a CLUB grant in the
 *  same city — produced 2 candidates; the form sent no hint for a
 *  CITY_MANAGER, so the server answered "ambiguous_scope" with "Выберите
 *  город/клуб в приложении", a choice the app offered nowhere.
 * ===================================================================== */

test("CTX-ROOT: the old behaviour — 2 CITY_MANAGER candidates and no hint -> ambiguous_scope (the live error)", () => {
  const raw = [city(NN, "Нижний Новгород"), city(DZ, "Дзержинск")];
  assert.deepEqual(resolveScopeFromCandidates(raw, undefined), { ok: false, code: "ambiguous_scope" });
  // And the message no longer sends the user to "the app" — it names the form.
  assert.doesNotMatch(describeScopeResolutionError("ambiguous_scope"), /в приложении/);
});

test("CTX-MANAGER: a MANAGER never needs a choice — the server uses their real EmployeeProfile club/city", () => {
  assert.deepEqual(buildQuestionContextOptions("MANAGER", []), { kind: null, options: [], requiresSelection: false });
  assert.equal(canSendQuestionAs(actor(), "MANAGER"), true);
  const svc = read("src/lib/server/questions/questions-service.ts");
  assert.match(svc, /if \(input\.senderContext === "MANAGER"\) \{\s*\n\s*cityId = user\.employeeProfile\.cityId;\s*\n\s*clubId = user\.employeeProfile\.clubId;/);
  // No hint is sent when no choice is needed.
  assert.deepEqual(resolveQuestionScopeSelection({ context: { kind: null, options: [], requiresSelection: false }, storedHint: undefined, picked: null }), {
    selectedId: null,
    scopeHint: undefined,
    missingSelection: false,
  });
});

test("CTX-CLUB-1: a CLUB_MANAGER with exactly one club auto-resolves — no selector, no hint needed", () => {
  const candidates = [club("poltava", NN, "Полтавская")];
  const opts = buildQuestionContextOptions("CLUB_MANAGER", candidates);
  assert.deepEqual(opts, { kind: "club", options: [{ id: "poltava", label: "Полтавская" }], requiresSelection: false });
  assert.deepEqual(resolveScopeFromCandidates(candidates, undefined), { ok: true, scope: candidates[0] });
  // A stale stored club from another session is NOT sent when no choice is needed.
  const sel = resolveQuestionScopeSelection({ context: opts, storedHint: { clubId: "old-club" }, picked: null });
  assert.equal(sel.scopeHint, undefined);
  assert.equal(sel.missingSelection, false);
});

test("CTX-CLUB-N: a CLUB_MANAGER with several clubs must pick one of THEIR clubs; submit is blocked until then", () => {
  const candidates = [club("poltava", NN, "Полтавская"), club("sormovo", NN, "Сормово")];
  const opts = buildQuestionContextOptions("CLUB_MANAGER", candidates);
  assert.equal(opts.requiresSelection, true);
  assert.deepEqual(opts.options.map((o) => o.id), ["poltava", "sormovo"]);
  // Server: no hint -> ambiguous (409); own club -> resolves.
  assert.deepEqual(resolveScopeFromCandidates(candidates, undefined), { ok: false, code: "ambiguous_scope" });
  assert.equal(scopeResolutionHttpStatus("ambiguous_scope"), 409);
  assert.deepEqual(resolveScopeFromCandidates(candidates, { clubId: "sormovo" }), { ok: true, scope: candidates[1] });
  // Client: nothing picked -> missing + disabled; Home's stored club pre-selects only if it is an option.
  const none = resolveQuestionScopeSelection({ context: opts, storedHint: undefined, picked: null });
  assert.equal(none.missingSelection, true);
  assert.equal(isSubmitDisabled({ submitting: false, text: "Вопрос", attachments: [], scopeMissing: none.missingSelection }), true);
  assert.deepEqual(resolveQuestionScopeSelection({ context: opts, storedHint: { clubId: "poltava" }, picked: null }).scopeHint, { clubId: "poltava" });
  assert.deepEqual(resolveQuestionScopeSelection({ context: opts, storedHint: { clubId: "foreign" }, picked: null }).missingSelection, true);
  const picked = resolveQuestionScopeSelection({ context: opts, storedHint: { clubId: "poltava" }, picked: "sormovo" });
  assert.deepEqual(picked.scopeHint, { clubId: "sormovo" });
  assert.equal(isSubmitDisabled({ submitting: false, text: "Вопрос", attachments: [], scopeMissing: picked.missingSelection }), false);
});

test("CTX-CLUB-FORGED: a forged foreign club is DENIED (403), never silently resolved; a forged pick never leaves the client", () => {
  const candidates = [club("poltava", NN), club("sormovo", NN)];
  const r = resolveScopeFromCandidates(candidates, { clubId: "foreign-club" });
  assert.deepEqual(r, { ok: false, code: "invalid_scope_hint" });
  assert.equal(scopeResolutionHttpStatus("invalid_scope_hint"), 403);
  const opts = buildQuestionContextOptions("CLUB_MANAGER", candidates);
  assert.equal(resolveQuestionScopeSelection({ context: opts, storedHint: undefined, picked: "foreign-club" }).scopeHint, undefined);
  const svc = read("src/lib/server/questions/questions-service.ts");
  assert.match(svc, /throw new AuthError\(scopeResolutionHttpStatus\(resolved\.code\), resolved\.code, describeScopeResolutionError\(resolved\.code\)\)/);
});

test("CTX-CITY-1: a CITY_MANAGER with one city auto-resolves — a CITY grant plus a CLUB grant in that same city is ONE choice, at city level (no club invented)", () => {
  const raw = [city(NN, "Нижний Новгород"), club("poltava", NN, "Полтавская", "Нижний Новгород")];
  const collapsed = collapseToCityCandidates(raw);
  assert.deepEqual(collapsed, [{ cityId: NN, cityName: "Нижний Новгород", clubId: null, clubName: null }]);
  assert.deepEqual(buildQuestionContextOptions("CITY_MANAGER", collapsed), { kind: "city", options: [{ id: NN, label: "Нижний Новгород" }], requiresSelection: false });
  assert.deepEqual(resolveScopeFromCandidates(collapsed, undefined), { ok: true, scope: collapsed[0] });
});

test("CTX-CITY-N: a CITY_MANAGER with several cities picks one of THEIR cities (the schema needs a city snapshot); never guessed", () => {
  const collapsed = collapseToCityCandidates([city(NN, "Нижний Новгород"), city(DZ, "Дзержинск")]);
  const opts = buildQuestionContextOptions("CITY_MANAGER", collapsed);
  assert.equal(opts.requiresSelection, true);
  assert.deepEqual(opts.options, [{ id: NN, label: "Нижний Новгород" }, { id: DZ, label: "Дзержинск" }]);
  const sel = resolveQuestionScopeSelection({ context: opts, storedHint: undefined, picked: DZ });
  assert.deepEqual(sel.scopeHint, { cityId: DZ });
  assert.deepEqual(resolveScopeFromCandidates(collapsed, sel.scopeHint), { ok: true, scope: collapsed[1] });
});

test("CTX-CITY-FORGED: a forged foreign city is DENIED (403)", () => {
  const collapsed = collapseToCityCandidates([city(NN), city(DZ)]);
  assert.deepEqual(resolveScopeFromCandidates(collapsed, { cityId: "moscow" }), { ok: false, code: "invalid_scope_hint" });
  assert.equal(scopeResolutionHttpStatus("invalid_scope_hint"), 403);
  assert.equal(scopeResolutionHttpStatus("no_scope"), 403);
});

test("CTX-SHARED: the form's options and the POST resolve against the SAME server-side candidates (one resolver), from real grants — never client storage", () => {
  const svc = read("src/lib/server/questions/questions-service.ts");
  assert.match(svc, /const candidates = await resolveQuestionScopeCandidates\(user, actor, input\.senderContext\);/);
  assert.match(svc, /buildQuestionContextOptions\(senderContext, await resolveQuestionScopeCandidates\(user, actor, senderContext\)\)/);
  assert.match(svc, /: collapseToCityCandidates\(await buildCityManagerScopeCandidates\(actor\)\);/);
  assert.doesNotMatch(code("src/app/api/questions/context/route.ts"), /localStorage|clubId|cityId/);
});

test("CTX-DRAFT: picking a club/city changes only that pick — category, text, attachments and the anonymous toggle are separate state and travel unchanged", () => {
  const page = read("src/app/questions/ask/page.tsx");
  assert.match(page, /onChange=\{setPickedScopeId\}/);
  for (const state of ["const [category, setCategory]", "const [text, setText]", "const [anonymous, setAnonymous]", "const [attachments, setAttachments]"]) {
    assert.ok(page.includes(state), state);
  }
  assert.match(page, /buildCreateQuestionPayload\(\{ senderContext, category, text, anonymous, attachments, scopeHint: scopeSelection\.scopeHint \}\)/);
  // The payload keeps every done attachment and the exact anonymous flag, whatever scope is picked.
  const done = { localId: "a", file: { name: "photo.jpg" } as File, status: "done" as const, storageKey: "questions/u/1.jpg", errorMessage: null };
  for (const scopeHint of [undefined, { clubId: "sormovo" }, { cityId: DZ }]) {
    const payload = buildCreateQuestionPayload({ senderContext: "CLUB_MANAGER", category: "IDEA", text: " Вопрос ", anonymous: true, attachments: [done], scopeHint });
    assert.equal(payload.anonymous, true);
    assert.equal(payload.category, "IDEA");
    assert.equal(payload.text, "Вопрос");
    assert.deepEqual(payload.attachments, [{ storageKey: "questions/u/1.jpg", originalName: "photo.jpg" }]);
  }
});

test("CTX-VIEWAS: a persona preview is read-only up front (no options resolved for the persona); the POST still runs as the REAL actor behind the write guard", () => {
  const route = read("src/app/api/questions/context/route.ts");
  assert.match(route, /if \(viewContext !== null && viewContext\.previewRole !== "CITY_MANAGER"\) \{/);
  assert.ok(route.indexOf("previewReadOnly: true") < route.indexOf("getQuestionContextOptions(user, actor, requested)"));
  assert.equal(isSubmitDisabled({ submitting: false, text: "Вопрос", attachments: [], readOnly: true }), true);
  const post = read("src/app/api/questions/route.ts");
  assert.match(post, /const user = await requireActiveAccess\(\);\s*\n\s*const actor = await getActorContext\(user\);/);
  assert.doesNotMatch(post, /resolveEffectiveReadContext|previewRole/);
  const mw = read("src/middleware.ts");
  assert.match(mw, /VIEW_AS_READ_ONLY/);
});

/* ===================================================================== *
 *  QA-04.2B — anonymous question privacy
 *
 *  Root cause: shouldRevealAuthor revealed an anonymous author to ANY actor
 *  with system access (legacy AppRole=ADMIN or a PROJECT_ADMIN grant),
 *  regardless of the capacity they were viewing in — so a CITY_MANAGER
 *  account that is also ADMIN saw full names in its own leadership inbox.
 * ===================================================================== */

const record = (overrides: Partial<QuestionRecordForSanitize> = {}): QuestionRecordForSanitize => ({
  id: "q-1",
  category: "TRAINING",
  text: "Когда следующее обучение?",
  anonymous: true,
  status: "NEW",
  authorUserId: "author-1",
  authorDisplayName: "Ева Губанкова",
  senderRole: "MANAGER",
  cityIdSnapshot: NN,
  clubIdSnapshot: "poltava",
  cityNameSnapshot: "Нижний Новгород",
  clubNameSnapshot: "Полтавская",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  attachments: [{ id: "att-1", originalName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 10 }],
  ...overrides,
});

const CM = actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: NN })] });
const CLUB_MGR = actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "poltava" })] });
const LEGACY_CLUB_MGR = actor({ appRole: "CLUB_MANAGER", employeeClubId: "poltava" });
const ADMIN = actor({ appRole: "ADMIN" });
const PROJECT_ADMIN = actor({ grants: [grant({ role: "PROJECT_ADMIN", scopeType: "SYSTEM" })] });
const ADMIN_AND_CM = actor({ appRole: "ADMIN", grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: NN })] });

function assertMasked(dto: ReturnType<typeof sanitizeQuestionForActor>) {
  assert.equal(dto.authorDisplay, "Анонимный сотрудник");
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "authorUserId"), false);
  const json = JSON.stringify(dto);
  assert.doesNotMatch(json, /Ева|Губанкова|author-1/);
}

test("PRIV-CLUB: anonymous question + CLUB_MANAGER (grant or legacy) -> no real author name/id in the DTO", () => {
  assertMasked(sanitizeQuestionForActor(CLUB_MGR, record()));
  assertMasked(sanitizeQuestionForActor(LEGACY_CLUB_MGR, record()));
  assertMasked(sanitizeQuestionForActor(actor({ appRole: "ADMIN", grants: CLUB_MGR.grants }), record()));
});

test("PRIV-CITY: anonymous question + CITY_MANAGER -> masked — INCLUDING a CITY_MANAGER who is also legacy ADMIN (the live leak)", () => {
  assertMasked(sanitizeQuestionForActor(CM, record()));
  assertMasked(sanitizeQuestionForActor(ADMIN_AND_CM, record()));
  assertMasked(sanitizeQuestionForActor(actor({ grants: [...PROJECT_ADMIN.grants, ...CM.grants] }), record()));
  // A CITY-level snapshot (no club) is covered too.
  assertMasked(sanitizeQuestionForActor(ADMIN_AND_CM, record({ clubIdSnapshot: null, clubNameSnapshot: null })));
});

test("PRIV-OD: OPERATIONS_DIRECTOR (a recipient of every question) never sees the author, even with system access", () => {
  const od = actor({ appRole: "ADMIN", grants: [grant({ role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK" })] });
  assertMasked(sanitizeQuestionForActor(od, record()));
});

test("PRIV-ADMIN: PROJECT_ADMIN (legacy ADMIN or a PROJECT_ADMIN grant) still sees the real author — also when their leadership scope is ELSEWHERE", () => {
  for (const a of [ADMIN, PROJECT_ADMIN, actor({ appRole: "ADMIN", grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: DZ })] })]) {
    const dto = sanitizeQuestionForActor(a, record());
    assert.equal(dto.authorDisplay, "Ева Губанкова");
    assert.equal(dto.authorUserId, "author-1");
  }
});

test("PRIV-OPEN: a non-anonymous question shows the author normally to CLUB_MANAGER and CITY_MANAGER", () => {
  for (const a of [CLUB_MGR, CM, ADMIN_AND_CM]) {
    const dto = sanitizeQuestionForActor(a, record({ anonymous: false }));
    assert.equal(dto.authorDisplay, "Ева Губанкова");
    assert.equal(dto.authorUserId, "author-1");
  }
});

test("PRIV-SELF: the author still sees their own identity (existing self-view), even if they are also a leader of that scope", () => {
  const selfLeader = actor({ userId: "author-1", grants: CM.grants });
  assert.equal(shouldRevealAuthor(selfLeader, { authorUserId: "author-1", anonymous: true, cityIdSnapshot: NN, clubIdSnapshot: "poltava" }), true);
});

test("PRIV-LEADER: leadership coverage follows real scope — out-of-scope or ended grants are not leaders of the question", () => {
  const q = { cityIdSnapshot: NN, clubIdSnapshot: "poltava" };
  assert.equal(isLeadershipViewer(CM, q), true);
  assert.equal(isLeadershipViewer(CLUB_MGR, q), true);
  assert.equal(isLeadershipViewer(actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: DZ })] }), q), false);
  assert.equal(isLeadershipViewer(actor({ grants: [grant({ role: "CITY_MANAGER", scopeType: "CITY", cityId: NN, status: "ENDED" })] }), q), false);
  assert.equal(isLeadershipViewer(actor({ grants: [grant({ role: "CLUB_MANAGER", scopeType: "CLUB", clubId: "sormovo" })] }), q), false);
  assert.equal(isLeadershipViewer(ADMIN, q), false);
});

test("PRIV-LIST-DETAIL: list and detail (and status change, and the author's create response) all go through the SAME sanitizer with the scope snapshots — never real FIO in one and masked in the other", () => {
  const svc = read("src/lib/server/questions/questions-service.ts");
  assert.match(svc, /questions: rows\.map\(\(r\) => sanitizeQuestionForActor\(actor, toSanitizeInput\(r\)\)\)/);
  assert.equal((svc.match(/sanitizeQuestionForActor\(actor, toSanitizeInput\(/g) ?? []).length, 5);
  assert.match(svc, /cityIdSnapshot: row\.cityIdSnapshot,\s*\n\s*clubIdSnapshot: row\.clubIdSnapshot,/);
  // Same viewer, same row -> identical masking in a "list" batch and a single "detail".
  const list = [record(), record({ id: "q-2" })].map((r) => sanitizeQuestionForActor(ADMIN_AND_CM, r));
  const detail = sanitizeQuestionForActor(ADMIN_AND_CM, record());
  for (const dto of [...list, detail]) assertMasked(dto);
  // The list row renders "Анонимный сотрудник · Полтавская".
  assert.equal(`${detail.authorDisplay}${detail.clubName ? ` · ${detail.clubName}` : ""}`, "Анонимный сотрудник · Полтавская");
});

test("PRIV-NOTIFY: the new-question notification to leadership never carries the real name of an anonymous author", () => {
  const text = buildQuestionNotificationText({ senderRole: "MANAGER", anonymous: true, authorDisplayName: "Ева Губанкова", category: "TRAINING", cityName: "Нижний Новгород", clubName: "Полтавская" });
  assert.doesNotMatch(text, /Ева|Губанкова/);
  assert.match(text, /Новый анонимный вопрос сотрудника/);
  const open = buildQuestionNotificationText({ senderRole: "MANAGER", anonymous: false, authorDisplayName: "Ева Губанкова", category: "TRAINING", cityName: "Нижний Новгород", clubName: "Полтавская" });
  assert.match(open, /Ева Губанкова/);
  const svc = read("src/lib/server/notifications/notification-service.ts");
  assert.match(svc, /authorDisplayName: question\.anonymous \? null : question\.author\.displayName/);
});

test("PRIV-ATTACH: an anonymous question's attachment reveals no author — the download returns bytes + type + the uploaded file name only; no storage key or author id reaches any client DTO", () => {
  const dto = sanitizeQuestionForActor(CM, record());
  assert.deepEqual(Object.keys(dto.attachments[0]).sort(), ["id", "mimeType", "originalName", "sizeBytes"]);
  const header = contentDispositionForAttachment("photo.jpg", "image/jpeg");
  assert.doesNotMatch(header, /questions\/|author/);
  const route = code("src/app/api/questions/attachments/[attachmentId]/download/route.ts");
  assert.match(route, /"Content-Type": meta\.mimeType/);
  assert.doesNotMatch(route, /authorUserId|"X-/);
  const svc = read("src/lib/server/questions/questions-service.ts");
  const dl = svc.slice(svc.indexOf("export async function getQuestionAttachmentForDownload"), svc.indexOf("export interface ListQuestionsFilter"));
  assert.match(dl, /return \{ storageKey: attachment\.storageKey, mimeType: attachment\.mimeType, originalName: attachment\.originalName \};/);
});

test("PRIV-VIEWAS: question reads always use the REAL actor's grants (never a preview persona), so View As cannot widen identity visibility", () => {
  for (const f of ["src/app/api/questions/route.ts", "src/app/api/questions/[id]/route.ts", "src/app/api/questions/attachments/[attachmentId]/download/route.ts"]) {
    const src = code(f);
    assert.match(src, /getActorContext\(user\)/, f);
    assert.doesNotMatch(src, /resolveEffectiveReadContext|viewContext|previewRole/, f);
  }
});

test("PRIV-CACHE: persisted client cache is versioned past every pre-fix entry, so an old unmasked response is never replayed", () => {
  assert.equal(CACHE_SCHEMA_VERSION, 2);
});
