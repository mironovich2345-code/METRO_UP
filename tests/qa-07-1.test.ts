import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { METRIC_PRICING, PRICING_VERSION, priceMetricUsage, resolveModelPrice } from "../src/lib/telemetry/metric-pricing";
import { buildMetricUsageEvent } from "../src/lib/telemetry/metric-usage-core";
import { describeCost } from "../src/lib/control/telemetry-view";
import type { MetricUsageSummaryDTO } from "../src/lib/api/telemetry-types";

(globalThis as { React?: typeof React }).React = React;
const { MetricCostBody } = await import("../src/components/control/TelemetryCards");

/**
 * Sprint: LIVE QA QA-07.1 — verified OpenAI pricing (official pricing,
 * verified 2026-10-12): gpt-4o-mini $0.15 in / $0.075 cached in / $0.60 out
 * per 1M tokens (same for gpt-4o-mini-2024-07-18); file_search $2.50 per
 * 1 000 calls. Costs are integer micro-USD.
 */

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const usage = (model: string, o: { input?: number; cached?: number; output?: number; fs?: number }) =>
  priceMetricUsage({ model, inputTokens: o.input ?? 0, cachedInputTokens: o.cached ?? 0, outputTokens: o.output ?? 0, fileSearchCalls: o.fs ?? 0 });

test("VERSION (updated for QA-07.3.1): pricing version openai-2026-10-13 (gpt-6-luna added), configured in code (no runtime fetch)", () => {
  assert.equal(PRICING_VERSION, "openai-2026-10-13");
  assert.equal(METRIC_PRICING.version, "openai-2026-10-13");
  const src = read("src/lib/telemetry/metric-pricing.ts");
  assert.match(src, /official OpenAI pricing/);
  assert.match(src, /verified\s+\*?\s*2026-10-12/);
  assert.doesNotMatch(code("src/lib/telemetry/metric-pricing.ts"), /fetch\(|https?:\/\//);
});

for (const model of ["gpt-4o-mini", "gpt-4o-mini-2024-07-18"]) {
  test(`PRICE ${model}: input $0.15, cached input $0.075, output $0.60 per 1M tokens`, () => {
    assert.deepEqual(usage(model, { input: 1_000_000 }), { costMicroUsd: 150_000, pricingVersion: "openai-2026-10-13" });
    assert.equal(usage(model, { input: 1_000_000, cached: 1_000_000 }).costMicroUsd, 75_000); // fully cached input
    assert.equal(usage(model, { output: 1_000_000 }).costMicroUsd, 600_000);
    // Realistic turn: 3 000 input (1 000 cached) + 400 output
    // = 2 000×0.15 + 1 000×0.075 + 400×0.6 = 300 + 75 + 240 = 615 micro-USD
    assert.equal(usage(model, { input: 3000, cached: 1000, output: 400 }).costMicroUsd, 615);
  });
}

test("FILE-SEARCH: $2.50 / 1 000 calls = 2 500 micro-USD per call, ADDED to token cost (retrieved tokens are not double-counted)", () => {
  assert.equal(usage("gpt-4o-mini", { fs: 1 }).costMicroUsd, 2500);
  assert.equal(usage("gpt-4o-mini", { fs: 1000 }).costMicroUsd, 2_500_000);
  // token cost 615 + 1 call 2 500 = 3 115 — the call fee is separate from the input tokens.
  assert.equal(usage("gpt-4o-mini-2024-07-18", { input: 3000, cached: 1000, output: 400, fs: 1 }).costMicroUsd, 3115);
});

test("UNKNOWN: unknown or merely similar model ids stay UNPRICED (no prefix / alias matching)", () => {
  for (const m of ["gpt-4o", "gpt-4o-mini-2025-01-01", "gpt-4o-mini-search-preview", "gpt-4.1-mini", "GPT-4O-MINI", " gpt-4o-mini"]) {
    assert.equal(resolveModelPrice(m), null, m);
    assert.deepEqual(usage(m, { input: 1000, output: 100 }), { costMicroUsd: null, pricingVersion: null }, m);
  }
});

test("ACTUAL-MODEL: pricing uses the model the provider actually ran, never the requested model's price", () => {
  const ctx = { kind: "CHAT" as const, requestedModel: "gpt-4o-mini", userId: "u", conversationId: "c", messageId: "m" };
  const different = buildMetricUsageEvent({ usage: { inputTokens: 1000, outputTokens: 100 }, model: "gpt-4o-2024-08-06", fileSearchCalls: 0 }, ctx);
  assert.equal(different.model, "gpt-4o-2024-08-06");
  assert.equal(different.costMicroUsd, null); // surfaced as an unpriced row in the by-model breakdown
  const snapshot = buildMetricUsageEvent({ usage: { inputTokens: 1000, outputTokens: 100 }, model: "gpt-4o-mini-2024-07-18", fileSearchCalls: 1 }, ctx);
  assert.equal(snapshot.model, "gpt-4o-mini-2024-07-18");
  assert.equal(snapshot.costMicroUsd, 150 + 60 + 2500);
  assert.equal(snapshot.pricingVersion, "openai-2026-10-13");
});

test("MIXED: a period with priced and older unpriced calls shows the money AND «Не рассчитано для N запросов»", () => {
  assert.deepEqual(describeCost({ calls: 19, unpricedCalls: 7, pricedCostMicroUsd: 1_240_000 }), {
    headline: "$1.24",
    priced: true,
    unpricedNote: "Не рассчитано для 7 запросов",
  });
  const data: MetricUsageSummaryDTO = {
    days: 30,
    since: "2026-09-12T00:00:00.000Z",
    trackingSince: "2026-10-01T00:00:00.000Z",
    totals: { key: "all", calls: 19, inputTokens: 50_000, outputTokens: 9_000, totalTokens: 59_000, pricedCostMicroUsd: 1_240_000, unpricedCalls: 7 },
    byModel: [],
    byKind: [],
  };
  const html = renderToStaticMarkup(createElement(MetricCostBody, { data }));
  assert.match(html, /\$1\.24/);
  assert.match(html, /Не рассчитано для 7 запросов/);
});

test("HISTORICAL: no backfill — existing null-cost events are never re-priced or updated", () => {
  const sources = [
    "src/lib/telemetry/metric-pricing.ts",
    "src/lib/telemetry/metric-usage-core.ts",
    "src/lib/server/telemetry/metric-usage.ts",
    "src/lib/server/telemetry/admin-analytics.ts",
    "src/lib/server/telemetry/cleanup.ts",
  ].map(code).join("\n");
  assert.doesNotMatch(sources, /metricUsageEvent\.(update|updateMany|upsert)\b/);
  assert.doesNotMatch(sources, /UPDATE\s+"?metric_usage_events/i);
  // Summaries add only stored costs: a null (unpriced) row contributes nothing and is counted as unpriced.
  const svc = code("src/lib/server/telemetry/admin-analytics.ts");
  assert.match(svc, /COALESCE\(SUM\("costMicroUsd"\), 0\)/);
  assert.match(svc, /COUNT\(\*\) FILTER \(WHERE "costMicroUsd" IS NULL\)/);
  // No new migration in this round.
  assert.doesNotMatch(read("prisma/schema.prisma"), /QA-07\.1/);
});

test("STORAGE: vector-store storage is not priced — an honest note on the cost page only, not on the Home card", () => {
  const src = code("src/lib/telemetry/metric-pricing.ts");
  assert.doesNotMatch(src, /storage|GB/i); // only in the doc comment, never in the cost math
  assert.match(code("src/components/control/MetricUsageAdmin.tsx"), /Хранение базы знаний в стоимость пока не включено\./);
  assert.doesNotMatch(code("src/components/control/TelemetryCards.tsx"), /Хранение базы знаний/);
});
