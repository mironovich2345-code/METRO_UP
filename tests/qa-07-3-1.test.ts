import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SCOPE_MODEL,
  SCOPE_MAX_OUTPUT_TOKENS,
  SCOPE_REASONING_EFFORT,
  buildScopeMessages,
  classifyMetricScope,
  resolveScopeModel,
  scopeCheckRequest,
} from "../src/lib/server/metric/scope";
import { buildResponseBody } from "../src/lib/server/metric/openai-body";
import type { CreateResponseInput } from "../src/lib/server/metric/openai";
import { parseResponsePayload } from "../src/lib/server/metric/openai-parse";
import { METRIC_PRICING, PRICING_VERSION, priceMetricUsage } from "../src/lib/telemetry/metric-pricing";
import { buildMetricUsageEvent } from "../src/lib/telemetry/metric-usage-core";

/**
 * Sprint: LIVE QA QA-07.3.1 — the scope classifier runs on its own fast model
 * (OPENAI_SCOPE_MODEL, default gpt-6-luna) with reasoning.effort = "none" and
 * a 16-token budget; the main Metric answer keeps OPENAI_MODEL.
 */

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("SCOPE-MODEL: OPENAI_SCOPE_MODEL is used when set; missing/blank falls back to gpt-6-luna", () => {
  assert.equal(DEFAULT_SCOPE_MODEL, "gpt-6-luna");
  assert.equal(resolveScopeModel(undefined), "gpt-6-luna");
  assert.equal(resolveScopeModel(null), "gpt-6-luna");
  assert.equal(resolveScopeModel(""), "gpt-6-luna");
  assert.equal(resolveScopeModel("   "), "gpt-6-luna");
  assert.equal(resolveScopeModel(" gpt-custom-scope "), "gpt-custom-scope");
  const env = code("src/lib/server/metric/env.ts");
  assert.match(env, /scopeModel: resolveScopeModel\(process\.env\.OPENAI_SCOPE_MODEL\),/);
  assert.match(env, /model: process\.env\.OPENAI_MODEL\?\.trim\(\) \|\| DEFAULT_MODEL,/); // main model unchanged
});

test("ROUTING: the scope check uses env.scopeModel; the main answer still uses env.model (OPENAI_MODEL)", () => {
  const chat = code("src/lib/server/metric/chat.ts");
  assert.match(chat, /scopeCheckRequest\(env\.scopeModel, env\.vectorStoreId!, buildScopeMessages\(history, input\.text\)\)/);
  const answer = chat.slice(chat.indexOf("async function answerInScope()"), chat.indexOf("async function finishTurn()"));
  assert.match(answer, /const reqInput = \{\s*model: env\.model,/);
  assert.doesNotMatch(answer, /scopeModel|reasoningEffort/);
  // «Продолжить» is a main-model call too.
  const cont = chat.slice(chat.indexOf("export async function continueMetric"));
  assert.match(cont, /transport\.createResponse\(\{\s*model: env\.model,/);
  assert.doesNotMatch(cont, /scopeModel/);
});

test("REQUEST: the classifier request — scope model, reasoning.effort none, ≤16 output tokens, no file_search", async () => {
  const req = scopeCheckRequest("gpt-6-luna", "vs_1", buildScopeMessages([], "Как оформить возврат?"));
  assert.equal(req.model, "gpt-6-luna");
  assert.equal(req.reasoningEffort, "none");
  assert.equal(SCOPE_REASONING_EFFORT, "none");
  assert.ok(SCOPE_MAX_OUTPUT_TOKENS >= 8 && SCOPE_MAX_OUTPUT_TOKENS <= 16, String(SCOPE_MAX_OUTPUT_TOKENS));
  assert.equal(req.maxOutputTokens, SCOPE_MAX_OUTPUT_TOKENS);
  // The actual HTTP body sent to the Responses API:
  const body = buildResponseBody(req, false);
  assert.equal(body.model, "gpt-6-luna");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal(body.max_output_tokens, 16);
  assert.equal(body.tools, undefined); // no file_search
  // And the classifier really sends that request through the transport.
  let sent: CreateResponseInput | null = null;
  await classifyMetricScope({ createResponse: async (i) => ((sent = i), parseResponsePayload({ id: "r", output_text: "IN_SCOPE" })) }, req);
  assert.equal(sent, req);
});

test("MAIN REQUEST unchanged: no `reasoning` field is ever added to the main answer body", () => {
  const main: CreateResponseInput = { model: "gpt-5.6-luna", instructions: "i", messages: [{ role: "user", content: "q" }], vectorStoreId: "vs_1", maxOutputTokens: 2500, maxNumResults: 6, useFileSearch: true };
  const body = buildResponseBody(main, true);
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal("reasoning" in body, false);
  assert.equal(body.max_output_tokens, 2500);
  assert.equal(body.stream, true);
  assert.ok(Array.isArray(body.tools));
  assert.match(code("src/lib/server/metric/openai.ts"), /import \{ buildResponseBody \} from "\.\/openai-body";/);
});

test("PRICING: gpt-6-luna at $0.10 input / $0.01 cached input / $0.50 output per 1M tokens (exact id only)", () => {
  assert.equal(PRICING_VERSION, "openai-2026-10-13");
  assert.deepEqual(METRIC_PRICING.models.find((m) => m.model === "gpt-6-luna"), {
    model: "gpt-6-luna",
    inputMicroUsdPer1M: 100_000,
    cachedInputMicroUsdPer1M: 10_000,
    outputMicroUsdPer1M: 500_000,
  });
  const p = (input: number, cached: number, output: number, model = "gpt-6-luna") =>
    priceMetricUsage({ model, inputTokens: input, cachedInputTokens: cached, outputTokens: output, fileSearchCalls: 0 }).costMicroUsd;
  assert.equal(p(1_000_000, 0, 0), 100_000);
  assert.equal(p(1_000_000, 1_000_000, 0), 10_000);
  assert.equal(p(0, 0, 1_000_000), 500_000);
  assert.equal(p(1_000_000, 0, 0, "gpt-6-luna-2026-10-01"), null); // a dated snapshot is not silently priced
  assert.equal(p(1_000_000, 0, 0, "gpt-5.6-luna"), null); // the main production model stays unpriced
});

test("SCOPE_CHECK telemetry: stores the model the provider ACTUALLY returned and its calculated cost", () => {
  // Typical scope check: 900 input tokens (400 cached), 3 output tokens.
  // 500×0.10 + 400×0.01 + 3×0.50 = 50 + 4 + 1.5 = 55.5 → 56 micro-USD
  const result = parseResponsePayload({
    id: "resp_scope",
    model: "gpt-6-luna",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: "IN_SCOPE" }] }],
    usage: { input_tokens: 900, output_tokens: 3, total_tokens: 903, input_tokens_details: { cached_tokens: 400 } },
  });
  const e = buildMetricUsageEvent(result, { kind: "SCOPE_CHECK", requestedModel: "gpt-6-luna", userId: "u", conversationId: "c", messageId: "m" });
  assert.equal(e.kind, "SCOPE_CHECK");
  assert.equal(e.model, "gpt-6-luna");
  assert.deepEqual([e.inputTokens, e.cachedInputTokens, e.outputTokens, e.totalTokens], [900, 400, 3, 903]);
  assert.equal(e.costMicroUsd, 56);
  assert.equal(e.pricingVersion, "openai-2026-10-13");
  // A different model actually returned → recorded as-is and unpriced (never the requested model's price).
  const other = buildMetricUsageEvent(
    parseResponsePayload({ id: "r", model: "gpt-6-luna-2026-11-01", output_text: "IN_SCOPE", usage: { input_tokens: 900, output_tokens: 3 } }),
    { kind: "SCOPE_CHECK", requestedModel: "gpt-6-luna", userId: "u", conversationId: "c", messageId: "m" },
  );
  assert.equal(other.model, "gpt-6-luna-2026-11-01");
  assert.equal(other.costMicroUsd, null);
  // chat.ts falls back to the SCOPE model (not the main model) only when the provider sends none.
  assert.match(code("src/lib/server/metric/chat.ts"), /buildMetricUsageEvent\(scopeOutcome\.result, \{ kind: "SCOPE_CHECK", requestedModel: env\.scopeModel,/);
});

test("NO SCHEMA CHANGE: no new migration for QA-07.3.1", () => {
  assert.doesNotMatch(read("prisma/schema.prisma"), /QA-07\.3\.1/);
});
