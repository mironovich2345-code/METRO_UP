import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { parseResponsePayload } from "../src/lib/server/metric/openai-parse";
import { consumeSSEStream } from "../src/lib/server/metric/stream-consume";
import {
  METRIC_PRICING,
  PRICING_VERSION,
  formatMicroUsd,
  priceMetricUsage,
  resolveModelPrice,
  type PricingRegistry,
} from "../src/lib/telemetry/metric-pricing";
import { buildMetricUsageEvent, recordMetricUsageSafely, type MetricUsageEventInput } from "../src/lib/telemetry/metric-usage-core";
import {
  FREQUENT_QUESTIONS_ROW_BOUND,
  groupFrequentQuestions,
  normalizeQuestion,
} from "../src/lib/telemetry/frequent-questions";
import { TELEMETRY_RETENTION_DAYS, parsePeriodDays, periodStart, retentionCutoff } from "../src/lib/telemetry/retention";
import { CLEANUP_INTERVAL_MS, cleanupTelemetry, createCleanupThrottle } from "../src/lib/telemetry/cleanup-core";
import { SCREENS, isScreenKey, resolveScreenKey, screenLabel, screenSurface } from "../src/lib/telemetry/screens";
import { createScreenViewGuard } from "../src/lib/client/screen-view-guard";
import { buildControlNav, flattenControlNav, type ControlNavFlags } from "../src/lib/control/control-nav";
import { describeCost, requestsWord, trackingNote } from "../src/lib/control/telemetry-view";
import { middleware } from "../src/middleware";
import { signViewAsToken, VIEW_AS_COOKIE } from "../src/lib/server/view-as-token";
import type { FrequentMetricQuestionsDTO, MetricUsageSummaryDTO, VisitSummaryDTO } from "../src/lib/api/telemetry-types";

(globalThis as { React?: typeof React }).React = React;
const { MetricCostBody, FrequentQuestionsList, VisitsBody } = await import("../src/components/control/TelemetryCards");
const { ControlDashboard } = await import("../src/components/control/ControlDashboard");

/**
 * Sprint: LIVE QA QA-07 — Metric usage/cost, frequent Metric questions and
 * screen-visit telemetry. Pure modules and components run for real; the
 * Prisma-backed paths (which need Postgres + the react-server condition) are
 * covered structurally here and were exercised against a local Postgres
 * during the round (see the QA-07 report).
 */

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-12T12:00:00.000Z");

const TEST_REGISTRY: PricingRegistry = {
  version: "test-2026-10",
  models: [{ model: "test-model", inputMicroUsdPer1M: 150_000, cachedInputMicroUsdPer1M: 75_000, outputMicroUsdPer1M: 600_000 }],
  tools: { fileSearchMicroUsdPer1kCalls: 2_500_000 },
};

/* ===================================================================== *
 *  A. Provider usage → event
 * ===================================================================== */

test("USAGE-PARSE: the provider's own usage, model and file_search calls are read from the Responses payload", () => {
  const r = parseResponsePayload({
    id: "resp_1",
    model: "gpt-4o-mini-2024-07-18",
    status: "completed",
    output: [
      { type: "file_search_call" },
      { type: "message", content: [{ type: "output_text", text: "Ответ." }] },
    ],
    usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500, input_tokens_details: { cached_tokens: 200 } },
  });
  assert.deepEqual(r.usage, { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cachedInputTokens: 200 });
  assert.equal(r.model, "gpt-4o-mini-2024-07-18");
  assert.equal(r.fileSearchCalls, 1);
  assert.equal(parseResponsePayload({ id: "r", output: [] }).usage, null); // none reported → null, never estimated
});

test("USAGE-STREAM: the streamed `response.completed` event carries usage — no request option needed, answer deltas unchanged", async () => {
  const final = { id: "resp_s", model: "gpt-4o-mini", status: "completed", output: [], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const sse = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "При" })}\n\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "вет" })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: final })}\n\n`;
  const bytes = new TextEncoder().encode(sse);
  let sent = false;
  const reader = { read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })), cancel: async () => {} };
  const deltas: string[] = [];
  const parsed = parseResponsePayload(await consumeSSEStream(reader, (t) => deltas.push(t)));
  assert.deepEqual(deltas, ["При", "вет"]);
  assert.deepEqual(parsed.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 0 });
  assert.doesNotMatch(code("src/lib/server/metric/openai.ts"), /stream_options|include_usage/);
});

test("USAGE-EVENT: tokens, the provider-reported model and the kind are stored exactly; no prompt/answer text", () => {
  const e = buildMetricUsageEvent(
    { usage: { inputTokens: 1000, outputTokens: 250, totalTokens: 1250, cachedInputTokens: 100 }, model: "gpt-4o-mini-2024-07-18", fileSearchCalls: 2 },
    { kind: "CHAT", requestedModel: "gpt-4o-mini", userId: "u1", conversationId: "c1", messageId: "m1" },
  );
  assert.equal(e.model, "gpt-4o-mini-2024-07-18");
  assert.equal(e.kind, "CHAT");
  assert.equal(e.provider, "openai");
  assert.deepEqual([e.inputTokens, e.cachedInputTokens, e.outputTokens, e.totalTokens, e.fileSearchCalls], [1000, 100, 250, 1250, 2]);
  assert.deepEqual([e.userId, e.conversationId, e.messageId], ["u1", "c1", "m1"]);
  assert.deepEqual(Object.keys(e).sort(), [
    "cachedInputTokens", "conversationId", "costMicroUsd", "fileSearchCalls", "inputTokens", "kind", "messageId",
    "model", "outputTokens", "pricingVersion", "provider", "totalTokens", "userId",
  ]);
  const cont = buildMetricUsageEvent({ usage: null, model: null }, { kind: "CONTINUE", requestedModel: "gpt-4o-mini", userId: "u1", conversationId: "c1", messageId: "m0" });
  assert.equal(cont.model, "gpt-4o-mini"); // provider sent no model → the requested id
  assert.equal(cont.kind, "CONTINUE");
  assert.deepEqual([cont.inputTokens, cont.outputTokens, cont.totalTokens, cont.costMicroUsd], [null, null, null, null]);
});

test("USAGE-SCHEMA: MetricUsageEvent has no prompt/answer/content column; costs are integer micro-USD", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model MetricUsageEvent {"), schema.indexOf("@@map(\"metric_usage_events\")"));
  for (const f of ["content", "prompt", "text", "answer", "question"]) assert.doesNotMatch(model, new RegExp(`^\\s+${f}\\s`, "m"), f);
  assert.match(model, /costMicroUsd\s+Int\?/);
  assert.match(model, /pricingVersion\s+String\?/);
  const sql = read("prisma/migrations/20261012000000_qa07_telemetry/migration.sql");
  assert.doesNotMatch(sql, /DROP|ALTER TABLE|DELETE|UPDATE /i); // additive only
  assert.match(sql, /CREATE TABLE "metric_usage_events"/);
  assert.match(sql, /CREATE TABLE "page_view_events"/);
});

/* ===================================================================== *
 *  B. Pricing — never invented, never $0
 * ===================================================================== */

test("PRICING-REGISTRY (updated for QA-07.1): only verified prices are configured — gpt-4o-mini, its 2024-07-18 snapshot and file_search", () => {
  assert.deepEqual(METRIC_PRICING.models.map((m) => m.model), ["gpt-4o-mini", "gpt-4o-mini-2024-07-18"]);
  assert.deepEqual(METRIC_PRICING.tools, { fileSearchMicroUsdPer1kCalls: 2_500_000 });
  assert.equal(PRICING_VERSION, "openai-2026-10-12");
});

test("PRICING-KNOWN: a priced model → exact integer micro-USD at call time, with the registry version persisted", () => {
  // 900 uncached × 0.15 + 100 cached × 0.075 + 250 × 0.6 (micro-USD per token) = 135 + 7.5 + 150 = 292.5 → 293
  const e = buildMetricUsageEvent(
    { usage: { inputTokens: 1000, outputTokens: 250, cachedInputTokens: 100 }, model: "test-model", fileSearchCalls: 0 },
    { kind: "CHAT", requestedModel: "test-model", userId: null, conversationId: null, messageId: null },
    TEST_REGISTRY,
  );
  assert.equal(e.costMicroUsd, 293);
  assert.equal(e.pricingVersion, "test-2026-10");
  assert.equal(resolveModelPrice("test-model-2026-01-01", TEST_REGISTRY), null); // QA-07.1: exact ids only, no alias
  // + 2 file_search calls at 2.5 USD / 1000 calls = 5000 micro-USD
  assert.deepEqual(
    priceMetricUsage({ model: "test-model", inputTokens: 1000, cachedInputTokens: 100, outputTokens: 250, fileSearchCalls: 2 }, TEST_REGISTRY),
    { costMicroUsd: 5293, pricingVersion: "test-2026-10" },
  );
  // A later price change does not touch the already-built (persisted) event.
  const later: PricingRegistry = { ...TEST_REGISTRY, version: "v2", models: [{ model: "test-model", inputMicroUsdPer1M: 1, outputMicroUsdPer1M: 1 }] };
  assert.equal(e.costMicroUsd, 293);
  assert.notEqual(priceMetricUsage({ model: "test-model", inputTokens: 1000, cachedInputTokens: 100, outputTokens: 250, fileSearchCalls: 0 }, later).costMicroUsd, 293);
});

test("PRICING-UNKNOWN: unknown model, missing usage or an unpriced tool → event persists with cost NULL (never 0)", () => {
  const unknown = buildMetricUsageEvent(
    { usage: { inputTokens: 500, outputTokens: 50 }, model: "gpt-unknown-model", fileSearchCalls: 0 },
    { kind: "CHAT", requestedModel: "gpt-4o-mini", userId: "u", conversationId: null, messageId: null },
  );
  assert.equal(unknown.costMicroUsd, null);
  assert.equal(unknown.pricingVersion, null);
  assert.equal(unknown.inputTokens, 500);
  const noToolPrice: PricingRegistry = { ...TEST_REGISTRY, tools: null };
  assert.equal(priceMetricUsage({ model: "test-model", inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, fileSearchCalls: 1 }, noToolPrice).costMicroUsd, null);
  assert.equal(priceMetricUsage({ model: "test-model", inputTokens: null, cachedInputTokens: null, outputTokens: null, fileSearchCalls: 0 }, TEST_REGISTRY).costMicroUsd, null);
});

test("PRICING-UI: all-unpriced → «Стоимость пока недоступна» (not $0); partly unpriced → money + «Не рассчитано для N запросов»", () => {
  assert.deepEqual(describeCost({ calls: 7, unpricedCalls: 7, pricedCostMicroUsd: 0 }), { headline: "Стоимость пока недоступна", priced: false, unpricedNote: null });
  assert.deepEqual(describeCost({ calls: 10, unpricedCalls: 3, pricedCostMicroUsd: 1_234_567 }), { headline: "$1.23", priced: true, unpricedNote: "Не рассчитано для 3 запросов" });
  assert.equal(describeCost({ calls: 2, unpricedCalls: 1, pricedCostMicroUsd: 4200 }).unpricedNote, "Не рассчитано для 1 запроса");
  assert.equal(describeCost({ calls: 0, unpricedCalls: 0, pricedCostMicroUsd: 0 }).headline, "Запросов не было");
  assert.equal(formatMicroUsd(4200), "$0.0042"); // tiny calls stay visible
  assert.deepEqual([requestsWord(1), requestsWord(3), requestsWord(11), requestsWord(25)], ["запрос", "запроса", "запросов", "запросов"]);
});

/* ===================================================================== *
 *  C. Telemetry failure never breaks Metric
 * ===================================================================== */

test("FAILURE: a failing usage write is logged and swallowed — the caller (the answer) never sees it", async () => {
  const logs: string[] = [];
  const event = buildMetricUsageEvent({ usage: { inputTokens: 1, outputTokens: 1 }, model: "m" }, { kind: "CHAT", requestedModel: "m", userId: null, conversationId: null, messageId: null });
  const ok = await recordMetricUsageSafely(async () => { throw new Error("db down"); }, event, (m) => logs.push(m));
  assert.equal(ok, false);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[telemetry\] metric_usage_write_failed kind=CHAT model=m err=Error$/);
  let written: MetricUsageEventInput | null = null;
  assert.equal(await recordMetricUsageSafely(async (e) => { written = e; }, event, () => {}), true);
  assert.equal(written, event);
});

test("FAILURE-WIRING: chat records usage fire-and-forget in `finally` (CHAT) and after the continuation call (CONTINUE); provider errors are not swallowed", () => {
  const chat = code("src/lib/server/metric/chat.ts");
  assert.match(chat, /try \{\s*return await finishTurn\(\);\s*\} finally \{\s*void \(deps\.recordUsage \?\? recordMetricUsage\)\(\s*buildMetricUsageEvent\(result, \{ kind: "CHAT", requestedModel: env\.model, userId: user\.id, conversationId: conv\.id, messageId: assistantMessageId \}\),/);
  assert.match(chat, /void \(deps\.recordUsage \?\? recordMetricUsage\)\(\s*buildMetricUsageEvent\(result, \{ kind: "CONTINUE", requestedModel: env\.model, userId: user\.id, conversationId: conv\.id, messageId: last\.id \}\),/);
  // The provider call itself sits BEFORE the try — its failure still propagates.
  assert.ok(chat.indexOf("await transport.streamResponse(reqInput") < chat.indexOf("return await finishTurn()"));
  assert.match(chat, /console\.error\(`\[metric\] continue stage=openai[^`]*`\);\s*throw e;/);
  const store = code("src/lib/server/telemetry/metric-usage.ts");
  assert.match(store, /recordMetricUsageSafely\(/);
});

/* ===================================================================== *
 *  D. Frequent Metric questions
 * ===================================================================== */

test("FREQ-NORMALIZE: case, whitespace and surrounding punctuation are normalized; different wording stays separate", () => {
  const same = ["Как оформить возврат?", " как оформить возврат ", "КАК ОФОРМИТЬ ВОЗВРАТ!", "  КАК   ОФОРМИТЬ\tВОЗВРАТ?!  ", "«Как оформить возврат?»"];
  for (const t of same) assert.equal(normalizeQuestion(t), "как оформить возврат", t);
  assert.notEqual(normalizeQuestion("Как оформить возврат?"), normalizeQuestion("Как отменить договор?"));
  assert.equal(normalizeQuestion("Привет ,как дела ?"), "привет, как дела");
  assert.equal(normalizeQuestion("Скидка 100%"), "скидка 100%"); // meaningful symbols stay
  assert.equal(normalizeQuestion("?!..."), "");
});

test("FREQ-GROUP: one group per normalized text, a real original as display, deterministic order (count desc, then key)", () => {
  const rows = [
    { content: "КАК ОФОРМИТЬ ВОЗВРАТ!" },
    { content: "Как заморозить карту?" },
    { content: "Как оформить возврат?" },
    { content: "Как оформить возврат?" },
    { content: " как оформить возврат " },
    { content: "Б вопрос" },
    { content: "А вопрос" },
    { content: "Как заморозить карту?" },
    { content: "???" },
  ];
  assert.deepEqual(groupFrequentQuestions(rows, 10), [
    { question: "Как оформить возврат?", count: 4 },
    { question: "Как заморозить карту?", count: 2 },
    { question: "А вопрос", count: 1 },
    { question: "Б вопрос", count: 1 },
  ]);
  assert.deepEqual(groupFrequentQuestions(rows, 10), groupFrequentQuestions([...rows], 10));
  assert.equal(groupFrequentQuestions(rows, 2).length, 2);
  // Ties between display variants → the most recent (rows are newest first).
  assert.equal(groupFrequentQuestions([{ content: "ВОПРОС" }, { content: "Вопрос" }], 5)[0].question, "ВОПРОС");
});

test("FREQ-SOURCE: only USER Metric messages in the period, newest first, bounded; assistant/system/sync text never included", () => {
  const svc = code("src/lib/server/telemetry/admin-analytics.ts");
  assert.match(svc, /prisma\.metricMessage\.findMany\(\{\s*where: \{ role: "USER", createdAt: \{ gte: since \} \},\s*orderBy: \[\{ createdAt: "desc" \}, \{ seq: "desc" \}\],\s*take: FREQUENT_QUESTIONS_ROW_BOUND,\s*select: \{ content: true \},/);
  assert.equal(FREQUENT_QUESTIONS_ROW_BOUND, 5000);
  // The «Продолжить» directive is sent to the provider but never stored as a USER message.
  const chat = code("src/lib/server/metric/chat.ts");
  assert.match(chat, /\{ role: "user", content: CONTINUE_DIRECTIVE \}/);
  assert.doesNotMatch(chat, /appendMessages\([^)]*CONTINUE_DIRECTIVE/);
  // Knowledge sync never writes MetricMessage.
  assert.doesNotMatch(code("src/lib/server/metric/knowledge-sync.ts"), /metricMessage/);
});

test("PERIODS: 7 and 30 days (default 30), both clamped to the 90-day retention cutoff", () => {
  assert.equal(parsePeriodDays("7"), 7);
  assert.equal(parsePeriodDays("30"), 30);
  assert.equal(parsePeriodDays(null), 30);
  assert.equal(parsePeriodDays("365"), 30);
  assert.equal(periodStart(7, NOW).toISOString(), new Date(NOW.getTime() - 7 * DAY).toISOString());
  assert.equal(periodStart(30, NOW).toISOString(), new Date(NOW.getTime() - 30 * DAY).toISOString());
  assert.ok(periodStart(30, NOW) >= retentionCutoff(NOW));
});

/* ===================================================================== *
 *  E. RBAC — analytics are PROJECT_ADMIN only
 * ===================================================================== */

const ADMIN_TELEMETRY_ROUTES = [
  "src/app/api/control/admin/metric-usage/route.ts",
  "src/app/api/control/admin/metric-questions/route.ts",
  "src/app/api/control/admin/visits/route.ts",
];

test("RBAC-API: every telemetry read is requireSystemAccess — SPM / CLUB_MANAGER / CITY_MANAGER / MANAGER get 403; never the shared SPM capability", () => {
  for (const f of ADMIN_TELEMETRY_ROUTES) {
    const c = code(f);
    assert.match(c, /await requireSystemAccess\(\);/, f);
    assert.doesNotMatch(c, /requireSharedControlAccess|requireUser\(|requireSPM/, f);
  }
  for (const f of ["src/app/control/(portal)/metric-usage/page.tsx", "src/app/control/(portal)/visits/page.tsx"]) {
    assert.match(code(f), /hasSystemAccessForUser\(user\)/, f);
    assert.doesNotMatch(code(f), /hasSharedControlAccessForUser/, f);
  }
});

const NONE: ControlNavFlags = { role: "EMPLOYEE", hasSystemAccess: false, isClubManager: false, isCityManager: false, isOperationsDirector: false };
const labels = (f: ControlNavFlags) => flattenControlNav(buildControlNav(f)).map((i) => i.label);

test("RBAC-NAV: «Расходы Метрика» / «Посещаемость» are in Система for PROJECT_ADMIN only — never for SPM or managers", () => {
  const system = buildControlNav({ ...NONE, hasSystemAccess: true }).find((g) => g.id === "system")!;
  assert.deepEqual(system.items.map((i) => i.label), ["Метрик", "Роли", "Сотрудники", "Логи", "Расходы Метрика", "Посещаемость"]);
  for (const f of [{ ...NONE, role: "SPM" as const }, { ...NONE, role: "CLUB_MANAGER" as const }, { ...NONE, isCityManager: true }, { ...NONE, isOperationsDirector: true }]) {
    for (const x of ["Расходы Метрика", "Посещаемость"]) assert.ok(!labels(f).includes(x), `${JSON.stringify(f)} ${x}`);
  }
});

/* ===================================================================== *
 *  F. Screen visits
 * ===================================================================== */

test("SCREEN-NORMALIZE: dynamic URLs map to a fixed key; query strings, ids and slugs never reach it", () => {
  const cases: Array<[string, string | null]> = [
    ["/home", "home"],
    ["/team/employee?id=123", "employee_card"],
    ["/questions/8b1f0c3e-1234-4cde-9abc-001122334455", "question_detail"],
    ["/questions/ask", "question_ask"],
    ["/academy/lesson/how-to-sell?from=home", "academy_lesson"],
    ["/academy/course-1", "academy_course"],
    ["/scripts/objections", "script"],
    ["/control/metric", "control_metric"],
    ["/control/metric-usage", "control_metric_usage"],
    ["/control/logs", "control_logs"],
    ["/admin/content/lessons/abc", "control_lesson_editor"],
    ["/spm/sales", "spm_sales"],
    ["/spm/rating", "spm_rating"],
    ["/control/login", null],
    ["/spm/login", null],
    ["/setup", null],
    ["/", null],
    ["/unknown", null],
  ];
  for (const [path, key] of cases) assert.equal(resolveScreenKey(path), key, path);
  for (const [key, def] of Object.entries(SCREENS)) {
    assert.match(key, /^[a-z_]+$/, key); // a controlled identifier, never a URL
    assert.ok(def.label.length > 0);
  }
  assert.equal(screenSurface("spm_sales"), "SPM");
  assert.equal(screenSurface("control_logs"), "CONTROL");
  assert.equal(screenSurface("home"), "MINI_APP");
  assert.equal(screenLabel("home"), "Главная");
});

test("SCREEN-COVERAGE: every Control nav destination is a tracked CONTROL/SPM screen", () => {
  const everyone: ControlNavFlags = { role: "ADMIN", hasSystemAccess: true, isClubManager: true, isCityManager: true, isOperationsDirector: true };
  for (const item of flattenControlNav(buildControlNav(everyone))) {
    const key = resolveScreenKey(item.href);
    assert.ok(key, item.href);
    assert.notEqual(screenSurface(key!), "MINI_APP", item.href);
  }
});

const ready = () => true;

test("VISIT-ONCE: an initial load is ONE visit; rerenders / Strict Mode double effects / remounts of the same path add none", () => {
  const g = createScreenViewGuard();
  assert.equal(g.next("/home", ready), "home");
  for (let i = 0; i < 5; i++) assert.equal(g.next("/home", ready), null);
});

test("VISIT-REVISIT: Home → Academy → Home is three real visits; no time debounce", () => {
  const g = createScreenViewGuard();
  assert.deepEqual([g.next("/home", ready), g.next("/academy", ready), g.next("/home", ready)], ["home", "academy", "home"]);
  // An untracked stop in between still makes the return a new visit.
  assert.deepEqual([g.next("/setup", ready), g.next("/home", ready)], [null, "home"]);
});

test("VISIT-READY: a Mini App screen waits for the confirmed session, then counts once; Control/SPM do not wait", () => {
  const g = createScreenViewGuard();
  let authed = false;
  const isReady = (s: string) => s !== "MINI_APP" || authed;
  assert.equal(g.next("/home", isReady), null);
  authed = true;
  assert.equal(g.next("/home", isReady), "home");
  assert.equal(g.next("/home", isReady), null);
  const c = createScreenViewGuard();
  assert.equal(c.next("/control/logs", (s) => s !== "MINI_APP"), "control_logs");
  assert.equal(c.next("/spm/sales", (s) => s !== "MINI_APP"), "spm_sales");
});

test("VISIT-TRACKER: one tracker in the root Providers; it sends only the screen key (no URL), non-blocking", () => {
  const providers = code("src/app/providers.tsx");
  assert.equal((providers.match(/<ScreenViewTracker \/>/g) ?? []).length, 1);
  const tracker = code("src/components/telemetry/ScreenViewTracker.tsx");
  assert.match(tracker, /body: JSON\.stringify\(\{ screen \}\)/);
  assert.match(tracker, /keepalive: true/);
  assert.match(tracker, /\}\)\.catch\(\(\) => \{\}\);/);
  assert.match(tracker, /screenViewGuard\.next\(pathname, \(surface\) => surface !== "MINI_APP" \|\| status === "authenticated"\)/);
  assert.doesNotMatch(tracker, /window\.location|searchParams|useSearchParams|href/);
  // Pages do not track individually.
  assert.doesNotMatch(code("src/app/home/page.tsx"), /telemetry/);
});

test("VISIT-API: the server takes the REAL session user, accepts only {screen} from the registry, derives the surface, rate-limits", () => {
  const route = code("src/app/api/telemetry/view/route.ts");
  assert.match(route, /const user = await requireUser\(\);/);
  assert.match(route, /z\.object\(\{ screen: z\.string\(\)\.max\(64\) \}\)\.strict\(\)/);
  assert.match(route, /if \(!isScreenKey\(body\.screen\)\) return jsonError\(400, "unknown_screen"\);/);
  assert.match(route, /await recordPageView\(user\.id, body\.screen\);/);
  assert.match(route, /getRateLimiter\(\)\.check\(`telemetry\.view:\$\{user\.id\}`/);
  assert.doesNotMatch(route, /body\.userId|telegramId|body\.surface|body\.url/);
  const store = code("src/lib/server/telemetry/page-views.ts");
  assert.match(store, /data: \{ userId, surface: screenSurface\(screen\), screenKey: screen \}/);
  assert.equal(isScreenKey("home"), true);
  assert.equal(isScreenKey("/team/employee?id=1"), false);
  assert.equal(isScreenKey("__proto__"), false);
  assert.equal(isScreenKey("toString"), false);
});

test("VISIT-VIEW-AS: a preview visit is still recorded (middleware allowlist) and owned by the real session user", async () => {
  process.env.AUTH_SECRET = "test-secret-abcdefghijklmnop";
  const token = await signViewAsToken(
    { realUserId: "real-actor", role: "CLUB_MANAGER", clubId: "club-1", cityId: null, previewPositionId: "ADMINISTRATOR" },
    process.env.AUTH_SECRET,
  );
  const req = (path: string) =>
    new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", headers: { cookie: `${VIEW_AS_COOKIE}=${token}` } });
  assert.equal((await middleware(req("/api/telemetry/view"))).status, 200);
  assert.equal((await middleware(req("/api/control/plan/tasks"))).status, 403); // business writes still blocked
  assert.doesNotMatch(code("src/lib/server/session.ts"), /view-?as/i); // requireUser → getCurrentUser = the real actor
});

/* ===================================================================== *
 *  G. 90-day retention
 * ===================================================================== */

test("RETENTION: 89 days kept, older than 90 excluded from queries and deleted; MetricMessage never touched", async () => {
  assert.equal(TELEMETRY_RETENTION_DAYS, 90);
  const cutoff = retentionCutoff(NOW);
  const d89 = new Date(NOW.getTime() - 89 * DAY);
  const d91 = new Date(NOW.getTime() - 91 * DAY);
  assert.ok(d89 >= cutoff);
  assert.ok(d91 < cutoff);
  const calls: Array<[string, Date]> = [];
  const r = await cleanupTelemetry(
    {
      deleteMetricUsageBefore: async (c) => (calls.push(["usage", c]), 2),
      deletePageViewsBefore: async (c) => (calls.push(["views", c]), 5),
    },
    NOW,
  );
  assert.deepEqual(r, { cutoff, metricUsage: 2, pageViews: 5 });
  assert.deepEqual(calls.map(([k, c]) => [k, c.toISOString()]).sort(), [["usage", cutoff.toISOString()], ["views", cutoff.toISOString()]]);
  const cleanup = code("src/lib/server/telemetry/cleanup.ts");
  assert.match(cleanup, /prisma\.metricUsageEvent\.deleteMany\(\{ where: \{ createdAt: \{ lt: cutoff \} \} \}\)/);
  assert.match(cleanup, /prisma\.pageViewEvent\.deleteMany\(\{ where: \{ createdAt: \{ lt: cutoff \} \} \}\)/);
  assert.doesNotMatch(cleanup, /metricMessage|metricConversation/);
  // Queries never read before the cutoff even if cleanup lags.
  const svc = code("src/lib/server/telemetry/admin-analytics.ts");
  assert.equal((svc.match(/const since = periodStart\(days, now\);/g) ?? []).length, 3);
});

test("RETENTION-THROTTLE: opportunistic cleanup runs at most once per hour per process", () => {
  const shouldRun = createCleanupThrottle();
  assert.equal(shouldRun(1_000), true);
  assert.equal(shouldRun(1_000 + CLEANUP_INTERVAL_MS - 1), false);
  assert.equal(shouldRun(1_000 + CLEANUP_INTERVAL_MS), true);
  assert.equal(CLEANUP_INTERVAL_MS, 60 * 60 * 1000);
  assert.match(read("package.json"), /"telemetry:cleanup": "node --conditions=react-server --import tsx scripts\/telemetry-cleanup\.ts"/);
});

/* ===================================================================== *
 *  H. PROJECT_ADMIN Home + honest empty states
 * ===================================================================== */

const usage = (o: Partial<MetricUsageSummaryDTO["totals"]>, trackingSince: string | null = "2026-09-01T00:00:00.000Z"): MetricUsageSummaryDTO => ({
  days: 30,
  since: "2026-09-12T12:00:00.000Z",
  trackingSince,
  totals: { key: "all", calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, pricedCostMicroUsd: 0, unpricedCalls: 0, ...o },
  byModel: [],
  byKind: [],
});

test("HOME-COST: unpriced → «Стоимость пока недоступна» with real counts, no $0; partly priced → money + warning; large numbers grouped", () => {
  const unpriced = renderToStaticMarkup(createElement(MetricCostBody, { data: usage({ calls: 12, unpricedCalls: 12, inputTokens: 1_234_567, outputTokens: 89_000 }) }));
  assert.match(unpriced, /Стоимость пока недоступна/);
  assert.doesNotMatch(unpriced, /\$0/);
  assert.match(unpriced, /1\s234\s567/);
  assert.match(unpriced, /Запросы/);
  const partial = renderToStaticMarkup(createElement(MetricCostBody, { data: usage({ calls: 3, unpricedCalls: 1, pricedCostMicroUsd: 2_500_000 }) }));
  assert.match(partial, /\$2\.50/);
  assert.match(partial, /Не рассчитано для 1 запроса/);
  const fresh = renderToStaticMarkup(createElement(MetricCostBody, { data: usage({}, null) }));
  assert.match(fresh, /Запросов не было/);
  assert.match(fresh, /Учёт ведётся с момента обновления — данных пока нет/);
  assert.equal(trackingNote("2026-10-01T00:00:00.000Z", "2026-09-12T00:00:00.000Z"), "Учёт ведётся с 1 октября");
});

test("HOME-EMPTY: no frequent questions / visits → honest empty states, never fake examples", () => {
  const q: FrequentMetricQuestionsDTO = { days: 30, since: "x", questions: [], processed: 0, bounded: false };
  assert.match(renderToStaticMarkup(createElement(FrequentQuestionsList, { data: q })), /За выбранный период вопросов пока нет/);
  const list = renderToStaticMarkup(createElement(FrequentQuestionsList, { data: { ...q, questions: [{ question: "Как оформить возврат?", count: 17 }] } }));
  assert.match(list, /Как оформить возврат\?/);
  assert.match(list, /17 раз/);
  const v: VisitSummaryDTO = { days: 7, since: "2026-10-05T00:00:00.000Z", trackingSince: null, totalViews: 0, uniqueUsers: 0, bySurface: [], topScreens: [] };
  assert.match(renderToStaticMarkup(createElement(VisitsBody, { data: v })), /За выбранный период посещений пока нет/);
  const withData = renderToStaticMarkup(createElement(VisitsBody, { data: { ...v, totalViews: 3, uniqueUsers: 2, topScreens: [{ key: "home", label: "Главная", views: 3, uniqueUsers: 2 }] } }));
  assert.match(withData, /Главная/);
  assert.doesNotMatch(withData, /home</); // labels, not raw keys
});

test("HOME-RBAC: PROJECT_ADMIN Home renders the telemetry section; SPM's Home renders none (and requests none)", () => {
  const admin = renderToStaticMarkup(createElement(ControlDashboard, { displayName: "A", role: "ADMIN", hasSystemAccess: true }));
  for (const t of ["Логи — последние 5 минут", "Вопросы сотрудников", "Обучение", "Расходы Метрика", "Частые вопросы Метрику", "Посещаемость", "7 дней", "30 дней"]) {
    assert.ok(admin.includes(t), t);
  }
  const spm = renderToStaticMarkup(createElement(ControlDashboard, { displayName: "S", role: "SPM", hasSystemAccess: false }));
  for (const t of ["Расходы Метрика", "Частые вопросы Метрику", "Посещаемость", "Логи"]) assert.ok(!spm.includes(t), t);
});

test("HOME-LOGS-UNCHANGED: the logs card keeps its own rolling 5 minutes / 5-minute refresh; the period toggle never reaches it", () => {
  const dash = code("src/components/control/ControlDashboard.tsx");
  assert.match(dash, /\.logs\(\{ sinceMinutes: LOG_CARD_WINDOW_MINUTES, limit: 10 \}, controller\.signal\)/);
  assert.match(dash, /setInterval\(load, LOG_CARD_REFRESH_MS\)/);
  assert.match(dash, /<RecentLogsCard \/>/);
  assert.doesNotMatch(dash, /<RecentLogsCard [^/]/); // no props (no period)
  const cards = code("src/components/control/TelemetryCards.tsx");
  assert.doesNotMatch(cards, /RecentLogsCard|EmployeeQuestionsCard|controlAdminApi\.logs/);
});

test("RESPONSIVE: telemetry cards wrap long text, stack on phones and use no wide table", () => {
  for (const f of ["src/components/control/TelemetryCards.tsx", "src/components/control/MetricUsageAdmin.tsx", "src/components/control/VisitsAdmin.tsx"]) {
    const c = code(f);
    assert.doesNotMatch(c, /<table/, f);
    assert.match(c, /\[overflow-wrap:anywhere\]|ScreenList|FrequentQuestionsList/, f);
  }
  assert.match(code("src/components/control/TelemetryCards.tsx"), /grid grid-cols-1 gap-4 lg:grid-cols-2/);
});
