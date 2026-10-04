import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildQuestionNotificationText,
  classifyTelegramHttpStatus,
  dedupeQuestionNotificationRecipients,
  QUESTION_ENTITY_TYPE,
  NOTIFICATION_DEEP_LINK_PATH,
} from "../src/lib/server/notifications/notification-core";

/**
 * METRO UP ROUND 1, Milestone 4 — Question Notifications.
 *
 * notification-core.ts is pure (no Prisma/server-only/network import) and
 * gets real, direct coverage below: the recipient-dedup decision and the
 * Telegram message builder. notification-service.ts (DB-touching) and
 * telegram-bot.ts (network-touching) require a live Postgres / real
 * Telegram Bot API — not available under node:test (this repo's established
 * convention — see employee-questions.test.ts's own header) — covered by
 * source-text structural checks for the guarantees a live run would
 * otherwise verify, plus named, traceable skip stubs.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const skipNoDb = { skip: "integration: requires Postgres + a real Telegram Bot API (not available under node:test)" } as const;

/* ============================== recipient resolution (pure dedup) ============================== */

test("RCPT-A: a MANAGER question's recipients are the covering CITY_MANAGER plus OPERATIONS_DIRECTOR — both present, neither duplicated", () => {
  const result = dedupeQuestionNotificationRecipients(["cm-1"], ["od-1"], "author-1");
  assert.deepEqual(new Set(result), new Set(["cm-1", "od-1"]));
  assert.equal(result.length, 2);
});

test("RCPT-B: a CLUB_MANAGER question follows the same rule as MANAGER (the service only varies in which grants it queries, not in how they're combined)", () => {
  const result = dedupeQuestionNotificationRecipients(["cm-1", "cm-2"], ["od-1", "od-2"], "author-1");
  assert.deepEqual(new Set(result), new Set(["cm-1", "cm-2", "od-1", "od-2"]));
});

test("RCPT-C: a user holding BOTH CITY_MANAGER and OPERATIONS_DIRECTOR grants (appearing in both input lists) is deduplicated to exactly ONE recipient — 'one notification, not two Telegram messages'", () => {
  const result = dedupeQuestionNotificationRecipients(["dual-1"], ["dual-1", "od-2"], "author-1");
  assert.deepEqual(new Set(result), new Set(["dual-1", "od-2"]));
  assert.equal(result.length, 2);
});

test("RCPT-D: the question's own author is excluded even if they would otherwise qualify (e.g. a CITY_MANAGER who also holds OPERATIONS_DIRECTOR filing their own question)", () => {
  const result = dedupeQuestionNotificationRecipients([], ["author-1", "od-2"], "author-1");
  assert.deepEqual(result, ["od-2"]);
});

test("RCPT-E: a CITY_MANAGER question has no CITY_MANAGER-tier recipients at all — given an empty CITY_MANAGER list, only OPERATIONS_DIRECTOR(s) remain", () => {
  const result = dedupeQuestionNotificationRecipients([], ["od-1"], "cm-author");
  assert.deepEqual(result, ["od-1"]);
});

test("RCPT-F: zero recipients (no covering CITY_MANAGER, no active OPERATIONS_DIRECTOR) resolves to an empty array, never a crash", () => {
  assert.deepEqual(dedupeQuestionNotificationRecipients([], [], "author-1"), []);
});

test("RCPT-WIRE-A: resolveQuestionNotificationRecipients skips the CITY_MANAGER grant query entirely for a CITY_MANAGER-authored question (never notifies a peer CITY_MANAGER)", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function resolveQuestionNotificationRecipients"), src.indexOf("export interface QuestionNotificationResult"));
  assert.match(fnSrc, /question\.senderRole !== "CITY_MANAGER"/);
});

test("RCPT-WIRE-B: the covering-CITY_MANAGER query filters status ACTIVE and matches either a CITY-scope grant for the question's city or a CLUB-scope grant for its exact club — never a bare cityId/clubId match without scopeType", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function resolveQuestionNotificationRecipients"), src.indexOf("export interface QuestionNotificationResult"));
  assert.match(fnSrc, /role: "CITY_MANAGER"/);
  assert.match(fnSrc, /status: "ACTIVE"/);
  assert.match(fnSrc, /scopeType: "CITY", cityId: question\.cityIdSnapshot/);
  assert.match(fnSrc, /scopeType: "CLUB" as const, clubId: question\.clubIdSnapshot/);
});

test("RCPT-WIRE-C: the OPERATIONS_DIRECTOR query is unconditional (always runs) and filters status ACTIVE — a suspended/ended OPERATIONS_DIRECTOR assignment is excluded", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function resolveQuestionNotificationRecipients"), src.indexOf("export interface QuestionNotificationResult"));
  assert.match(fnSrc, /role: "OPERATIONS_DIRECTOR", status: "ACTIVE"/);
});

test("RCPT-WIRE-D: resolveQuestionNotificationRecipients runs exactly two findMany calls total (never one per candidate row) — bounded, batched, no N+1", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function resolveQuestionNotificationRecipients"), src.indexOf("export interface QuestionNotificationResult"));
  const matches = fnSrc.match(/tx\.roleAssignment\.findMany/g) ?? [];
  assert.equal(matches.length, 2);
});

test("RCPT-WIRE-E: createQuestionNotification inserts recipients via ONE bulk createMany, never a per-recipient create inside a loop", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function createQuestionNotification"), src.indexOf("/* ============================== telegram delivery"));
  assert.match(fnSrc, /tx\.notificationRecipient\.createMany/);
  assert.doesNotMatch(fnSrc, /for\s*\(|\.forEach\(/);
});

test("RCPT-WIRE-F: createQuestionNotification returns null (no Notification row at all) when there are zero recipients — never an orphan zero-recipient row", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function createQuestionNotification"), src.indexOf("/* ============================== telegram delivery"));
  assert.match(fnSrc, /if \(recipientUserIds\.length === 0\) return null;/);
});

test("RCPT-INT-A: a MANAGER question's covering CITY_MANAGER actually receives a recipient row; an unrelated CITY_MANAGER (different city) does not", skipNoDb, () => {});
test("RCPT-INT-B: every active OPERATIONS_DIRECTOR receives a recipient row for a MANAGER/CLUB_MANAGER/CITY_MANAGER question alike", skipNoDb, () => {});
test("RCPT-INT-C: a SUSPENDED or ENDED CITY_MANAGER/OPERATIONS_DIRECTOR RoleAssignment is excluded from recipients", skipNoDb, () => {});
test("RCPT-INT-D: a CITY_MANAGER question never creates a recipient row for ANY CITY_MANAGER, including a peer whose scope happens to overlap", skipNoDb, () => {});

/* ============================== anonymity (SECURITY CRITICAL) ============================== */

test("ANON-TG-A: a non-anonymous MANAGER/CLUB_MANAGER question's Telegram text includes the real author name", () => {
  const text = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: false,
    authorDisplayName: "Иван Петров",
    category: "TRAINING",
    cityName: "Екатеринбург",
    clubName: "Полтавская",
  });
  assert.match(text, /Иван Петров/);
  assert.match(text, /^Новый вопрос сотрудника/);
});

test("ANON-TG-B: an anonymous MANAGER/CLUB_MANAGER question's Telegram text contains NO author name, even though authorDisplayName is null as the caller is required to pass", () => {
  const text = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: true,
    authorDisplayName: null,
    category: "TRAINING",
    cityName: "Екатеринбург",
    clubName: "Полтавская",
  });
  assert.match(text, /^Новый анонимный вопрос сотрудника/);
  assert.doesNotMatch(text, /Иван|Петров/);
});

test("ANON-TG-C: DEFENSE IN DEPTH — even if a caller mistakenly passes a real name alongside anonymous=true (a hypothetical bug), buildQuestionNotificationText independently refuses to include it", () => {
  const text = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: true,
    authorDisplayName: "Иван Петров", // caller bug — should never happen, must still be safe
    category: "TRAINING",
    cityName: "Екатеринбург",
    clubName: "Полтавская",
  });
  assert.doesNotMatch(text, /Иван|Петров/);
  assert.match(text, /^Новый анонимный вопрос сотрудника/);
});

test("ANON-TG-D: a non-anonymous CITY_MANAGER question (-> OPERATIONS_DIRECTOR) shows the name under the distinct 'от Ст. города' header, never the employee-question header", () => {
  const text = buildQuestionNotificationText({
    senderRole: "CITY_MANAGER",
    anonymous: false,
    authorDisplayName: "Анна Смирнова",
    category: "MANAGEMENT",
    cityName: "Екатеринбург",
    clubName: null,
  });
  assert.match(text, /^Новый вопрос от Ст\. города/);
  assert.match(text, /Анна Смирнова/);
  assert.doesNotMatch(text, /вопрос сотрудника/);
});

test("ANON-TG-E: an anonymous CITY_MANAGER question shows the anonymous 'от Ст. города' header with no name", () => {
  const text = buildQuestionNotificationText({
    senderRole: "CITY_MANAGER",
    anonymous: true,
    authorDisplayName: null,
    category: "MANAGEMENT",
    cityName: "Екатеринбург",
    clubName: null,
  });
  assert.match(text, /^Новый анонимный вопрос от Ст\. города/);
  assert.doesNotMatch(text, /Анна|Смирнова/);
});

test("ANON-TG-F: the Telegram text NEVER includes the question's full text content (section 5 — lock-screen privacy) — only category + location", () => {
  const text = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: false,
    authorDisplayName: "Иван Петров",
    category: "TECHNICAL",
    cityName: "Екатеринбург",
    clubName: "Полтавская",
  });
  // The function's own type signature has no "text"/"body" field to leak in
  // the first place — this additionally confirms the OUTPUT never grows one.
  assert.doesNotMatch(text, /когда|почему|как сделать/i);
});

test("ANON-TG-G: the location token is the club name when present, else the city name — never both together (matches the task's own 'Полтавская', never 'Полтавская, Екатеринбург')", () => {
  const withClub = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: false,
    authorDisplayName: "x",
    category: "OTHER",
    cityName: "Екатеринбург",
    clubName: "Полтавская",
  });
  assert.match(withClub, /Полтавская · Другое/);
  assert.doesNotMatch(withClub, /Екатеринбург/);

  const cityOnly = buildQuestionNotificationText({
    senderRole: "CITY_MANAGER",
    anonymous: false,
    authorDisplayName: "x",
    category: "OTHER",
    cityName: "Екатеринбург",
    clubName: null,
  });
  assert.match(cityOnly, /Екатеринбург · Другое/);
});

test("ANON-TG-H: every one of the 7 categories maps to a non-empty, distinct Russian label in the Telegram text", () => {
  const categories = ["WORK_PROCESSES", "TRAINING", "MANAGEMENT", "WORKING_CONDITIONS", "TECHNICAL", "IDEA", "OTHER"] as const;
  const labels = new Set<string>();
  for (const category of categories) {
    const text = buildQuestionNotificationText({ senderRole: "MANAGER", anonymous: true, authorDisplayName: null, category, cityName: "City", clubName: null });
    const match = text.match(/City · (.+)/);
    assert.ok(match);
    labels.add(match![1]);
  }
  assert.equal(labels.size, categories.length);
});

test("ANON-TG-I: the Telegram text is a plain string with no object fields at all — there is no 'hidden' id field anywhere for a JSON/log payload to expose", () => {
  const text = buildQuestionNotificationText({
    senderRole: "MANAGER",
    anonymous: true,
    authorDisplayName: null,
    category: "OTHER",
    cityName: "City",
    clubName: null,
  });
  assert.equal(typeof text, "string");
});

test("ANON-INAPP-A: the in-app projection is the SAME, already-hardened sanitizeQuestionForActor used by Milestone 3's list/detail endpoints — Milestone 4 introduces no second, independently-fallible anonymity path for in-app content", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  assert.match(src, /sanitizeQuestionForActor\(actor, toSanitizeInput\(question\)\)/);
  assert.match(src, /sanitizeQuestionForActor\(actor, toSanitizeInput\(r\)\)/);
});

/* ============================== telegram delivery classification (pure) ============================== */

test("TG-CLASS-A: HTTP 403 (bot blocked by user) classifies as 'blocked'", () => {
  assert.equal(classifyTelegramHttpStatus(403), "blocked");
});

test("TG-CLASS-B: HTTP 400 classifies as 'bad_request'", () => {
  assert.equal(classifyTelegramHttpStatus(400), "bad_request");
});

test("TG-CLASS-C: HTTP 429 (rate limited) classifies as 'rate_limited'", () => {
  assert.equal(classifyTelegramHttpStatus(429), "rate_limited");
});

test("TG-CLASS-D: any other non-2xx status falls back to the generic 'api_error' — never the raw status/body text itself", () => {
  assert.equal(classifyTelegramHttpStatus(500), "api_error");
  assert.equal(classifyTelegramHttpStatus(418), "api_error");
});

test("TG-CLASS-E: every classification code is a short, safe, lowercase_snake_case string — never containing 'telegram.org', a token-shaped value, or whitespace that could be raw response text", () => {
  for (const status of [400, 403, 429, 500]) {
    const code = classifyTelegramHttpStatus(status);
    assert.match(code, /^[a-z_]+$/);
    assert.doesNotMatch(code, /telegram\.org|bot\d/);
  }
});

/* ============================== telegram delivery wiring (source-text) ============================== */

test("TG-WIRE-A: sendTelegramMessage wraps its ENTIRE body in one try/catch — no path can throw out of it", () => {
  const src = read("src/lib/server/notifications/telegram-bot.ts");
  const sigIdx = src.indexOf("export async function sendTelegramMessage");
  const bodyOpenIdx = src.indexOf("{", src.indexOf(")", sigIdx)); // the function's own opening brace, after its parameter list
  const between = src.slice(bodyOpenIdx + 1, src.indexOf("try {", bodyOpenIdx));
  assert.match(between, /^\s*$/, "expected nothing but whitespace between the function body opening and its try block");
});

test("TG-WIRE-B: a missing/invalid Telegram identity never reaches sendTelegramMessage at all — the caller branches to a SKIPPED result first ('missing Telegram identity does not fail question')", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  assert.match(src, /u\.telegramId \? await sendTelegramMessage\(u\.telegramId, text, webAppUrl\) : \(\{ status: "SKIPPED", code: "no_identity" \} as const\)/);
});

test("TG-WIRE-C: deliverQuestionNotificationsTelegram wraps its entire body in a top-level try/catch — the explicit 'section 3' backstop so Telegram delivery can never fail question creation regardless of what goes wrong inside", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function deliverQuestionNotificationsTelegram"), src.indexOf("/* ============================== read state"));
  assert.match(fnSrc, /\btry\s*\{/);
  assert.match(fnSrc, /\}\s*catch\s*\{/);
});

test("TG-WIRE-D: createEmployeeQuestion AWAITS deliverQuestionNotificationsTelegram (never a bare un-awaited call that could disappear when the request ends) and does so AFTER the $transaction has already resolved", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const txIdx = src.indexOf("await prisma.$transaction(async (tx) => {");
  // "return { question, notificationResult };" is the transaction closure's
  // own return statement — a precise end-of-transaction marker (a bare
  // "});" search would false-match the nested tx.employeeQuestion.create({...})
  // call's own closing well before the transaction actually ends).
  const txEndIdx = src.indexOf("return { question, notificationResult };", txIdx);
  const deliverIdx = src.indexOf("await deliverQuestionNotificationsTelegram(created, notificationResult);");
  assert.ok(txIdx > 0 && txEndIdx > txIdx && deliverIdx > txEndIdx, "expected the delivery call awaited strictly after the transaction block");
});

test("TG-WIRE-E: createQuestionNotification (the durable write) runs INSIDE the question-creation transaction — committed atomically with the question row, never dependent on Telegram", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const txIdx = src.indexOf("await prisma.$transaction(async (tx) => {");
  const txEndIdx = src.indexOf("return { question, notificationResult };", txIdx);
  const createNotifIdx = src.indexOf("createQuestionNotification(tx, question)", txIdx);
  assert.ok(txIdx > 0 && createNotifIdx > txIdx && createNotifIdx < txEndIdx, "expected createQuestionNotification to run inside the transaction closure");
});

test("TG-WIRE-F: every delivery outcome (success AND failure) flows through the SAME single updateMany call inside deliverQuestionNotificationsTelegram — success/failure can never silently diverge into two different code paths that drift apart", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function deliverQuestionNotificationsTelegram"), src.indexOf("/* ============================== read state"));
  const matches = fnSrc.match(/prisma\.notificationRecipient\s*\n?\s*\.updateMany/g) ?? [];
  assert.equal(matches.length, 1);
});

test("TG-WIRE-G: the recorded telegramErrorCode is always the bounded, safe result.code — never a raw caught error, error message, or response body", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  assert.match(src, /telegramErrorCode: result\.status === "SENT" \? null : result\.code/);
});

test("TG-WIRE-H: recipients are delivered via Promise.all (parallel), never a sequential for/of await loop that would multiply latency per recipient", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function deliverQuestionNotificationsTelegram"), src.indexOf("/* ============================== read state"));
  assert.match(fnSrc, /await Promise\.all\(/);
  assert.doesNotMatch(fnSrc, /for\s*await|for\s*\(const \w+ of users\)/);
});

test("TG-WIRE-I: no bot token, Telegram response body, or raw caught error is ever passed to console.log/console.error anywhere in the notification modules", () => {
  for (const file of ["src/lib/server/notifications/telegram-bot.ts", "src/lib/server/notifications/notification-service.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /console\.(log|error|warn)\(/);
  }
});

test("TG-WIRE-J: the signed Telegram API request URL is built with the token read fresh from getServerEnv() inside the try block — never logged, never returned, never part of any thrown/returned value", () => {
  const src = read("src/lib/server/notifications/telegram-bot.ts");
  assert.match(src, /getServerEnv\(\)\.TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(src, /return.*token/i);
});

test("TG-INT-A: a successful Telegram send is recorded as telegramStatus=SENT with telegramSentAt set", skipNoDb, () => {});
test("TG-INT-B: a blocked/timeout/API-error send is recorded as telegramStatus=FAILED with a safe telegramErrorCode, and question creation still succeeds", skipNoDb, () => {});
test("TG-INT-C: a missing bot token (getServerEnv throws) is caught and recorded as FAILED/config_error, never propagated to the question-creation response", skipNoDb, () => {});

/* ============================== in-app read state ============================== */

test("INAPP-SCHEMA-A: Notification/NotificationRecipient models exist with the documented fields, including the (notificationId, userId) uniqueness guarantee", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model Notification \{/);
  assert.match(schema, /model NotificationRecipient \{/);
  assert.match(schema, /@@unique\(\[notificationId, userId\]\)/);
});

test("INAPP-SCHEMA-B: NotificationRecipient.readAt is nullable with NO default — a fresh row is unread (readAt IS NULL) until explicitly marked, never defaulted to 'already read'", () => {
  const schema = read("prisma/schema.prisma");
  const modelSrc = schema.slice(schema.indexOf("model NotificationRecipient {"), schema.indexOf("@@unique([notificationId, userId])"));
  assert.match(modelSrc, /readAt\s+DateTime\?\s*\n/);
});

test("INAPP-SCHEMA-C: the migration only CREATEs new types/tables/indexes — never drops or destructively alters an existing one", () => {
  const migration = read("prisma/migrations/20261004000000_notifications/migration.sql");
  assert.match(migration, /CREATE TABLE "notifications"/);
  assert.match(migration, /CREATE TABLE "notification_recipients"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DROP TYPE|ALTER TABLE "users"|ALTER TABLE "role_assignments"/i);
});

test("INAPP-STATUS-A: getEmployeeQuestionForActor never writes to EmployeeQuestion.status or calls employeeQuestion.update anywhere near the read-tracking call — opening a question never changes its business status", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function getEmployeeQuestionForActor"), src.indexOf("/**\n * METRO UP ROUND 1, Milestone 3, section 7 — attachment retrieval"));
  assert.doesNotMatch(fnSrc, /employeeQuestion\.update/);
  assert.match(fnSrc, /markQuestionNotificationRead\(actor\.userId, questionId\)/);
});

test("INAPP-STATUS-B: markQuestionNotificationRead never touches the employeeQuestion table at all (it only writes notificationRecipient.readAt)", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function markQuestionNotificationRead"), src.indexOf("/**\n * Section 9/11 — Home's unread badge"));
  assert.doesNotMatch(fnSrc, /employeeQuestion/);
  assert.match(fnSrc, /notificationRecipient\.updateMany/);
});

test("INAPP-INT-A: a freshly-created NotificationRecipient row is unread (readAt IS NULL) immediately after question creation", skipNoDb, () => {});
test("INAPP-INT-B: getUnreadQuestionNotificationCount decreases by exactly one after the corresponding question is opened by that recipient", skipNoDb, () => {});

/* ============================== auth: self-scoping ============================== */

test("AUTH-A: every call site of markQuestionNotificationRead passes actor.userId (the session-derived id) as the userId argument — never a client-supplied/body value", () => {
  const src = read("src/lib/server/questions/questions-service.ts");
  const calls = src.match(/markQuestionNotificationRead\([^)]*\)/g) ?? [];
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.match(call, /actor\.userId/);
});

test("AUTH-B: every call site of getUnreadQuestionNotificationCount passes actor.userId — never a client-supplied/body value", () => {
  const src = read("src/lib/server/rbac/cabinet-dashboards.ts");
  const calls = src.match(/getUnreadQuestionNotificationCount\([^)]*\)/g) ?? [];
  assert.ok(calls.length >= 1);
  for (const call of calls) assert.match(call, /actor\.userId/);
});

test("AUTH-C: markQuestionNotificationRead's own WHERE clause is scoped by its `userId` parameter — structurally incapable of updating a different user's row no matter what the caller passes elsewhere", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function markQuestionNotificationRead"), src.indexOf("/**\n * Section 9/11 — Home's unread badge"));
  assert.match(fnSrc, /where: \{ userId, readAt: null/);
});

test("AUTH-D: getUnreadQuestionNotificationCount's own WHERE clause is scoped by its `userId` parameter", () => {
  const src = read("src/lib/server/notifications/notification-service.ts");
  const fnSrc = src.slice(src.indexOf("export async function getUnreadQuestionNotificationCount"), src.length);
  assert.match(fnSrc, /where: \{ userId, readAt: null/);
});

/* ============================== misc constants ============================== */

test("CONST-A: QUESTION_ENTITY_TYPE matches the literal string already used by writeAudit's entityType for EmployeeQuestion", () => {
  assert.equal(QUESTION_ENTITY_TYPE, "EmployeeQuestion");
});

test("CONST-B: NOTIFICATION_DEEP_LINK_PATH points at the Questions area, not a per-question sub-path (section 6's explicit safe fallback)", () => {
  assert.equal(NOTIFICATION_DEEP_LINK_PATH, "/questions");
});

test("WIRE-SECRETS-A: no notification module ever constructs a response/log containing the raw bot token literal or env var name interpolated into a user-facing string", () => {
  for (const file of ["src/lib/server/notifications/telegram-bot.ts", "src/lib/server/notifications/notification-service.ts", "src/lib/server/notifications/notification-core.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /process\.env\.TELEGRAM_BOT_TOKEN/); // must go through getServerEnv(), never a direct env read
  }
});
