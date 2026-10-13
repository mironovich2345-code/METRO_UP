/**
 * Sprint: LIVE QA QA-07 — the ONE code-level pricing registry for Metric
 * provider calls (pure; no server-only import, so it is unit-tested).
 *
 * Unit: integer micro-USD (1 = 0.000001 USD). Prices are integer micro-USD
 * per 1M tokens (e.g. $0.15 / 1M → 150_000), so cost math is exact integer
 * arithmetic (BigInt) with ONE half-up rounding per call — no float
 * accumulation. The computed cost is persisted on MetricUsageEvent at call
 * time; a later price change (a new registry version) never rewrites old
 * spend.
 *
 * Source: official OpenAI pricing / model documentation, verified
 * 2026-10-12 (QA-07.1: gpt-4o-mini, file_search); gpt-6-luna added
 * 2026-10-13 (QA-07.3.1) → version openai-2026-10-13. Prices are matched by EXACT provider model id only —
 * no prefix/alias matching, so a different (e.g. future) snapshot stays
 * UNPRICED until it is added here explicitly. An unpriced call keeps
 * `costMicroUsd = null` and the admin UI says so — never $0. Prices are
 * never fetched at runtime; to change one, edit this file, bump
 * PRICING_VERSION and note the source + date. Already-recorded events are
 * never re-priced (MetricUsageEvent is append-only).
 *
 * NOT included in costMicroUsd: vector-store storage ($0.10 / GB / day, first
 * 1 GB free) — its usage is not recorded per call, so it is not estimated.
 */

export interface ModelPrice {
  /** Exact provider model id (see resolveModelPrice). */
  model: string;
  inputMicroUsdPer1M: number;
  /** Price for the cached part of the input; defaults to the input price. */
  cachedInputMicroUsdPer1M?: number;
  outputMicroUsdPer1M: number;
}

export interface ToolPrice {
  /** file_search tool calls, micro-USD per 1 000 calls. */
  fileSearchMicroUsdPer1kCalls: number;
}

export interface PricingRegistry {
  version: string;
  models: ModelPrice[];
  /** null = the file_search tool price is not configured. */
  tools: ToolPrice | null;
}

/** Bump whenever a price below changes. */
export const PRICING_VERSION = "openai-2026-10-13";

/** gpt-4o-mini: $0.15 input / $0.075 cached input / $0.60 output per 1M tokens. */
const GPT_4O_MINI = { inputMicroUsdPer1M: 150_000, cachedInputMicroUsdPer1M: 75_000, outputMicroUsdPer1M: 600_000 };

export const METRIC_PRICING: PricingRegistry = {
  version: PRICING_VERSION,
  models: [
    { model: "gpt-4o-mini", ...GPT_4O_MINI },
    // The snapshot the provider reports for requests to "gpt-4o-mini".
    { model: "gpt-4o-mini-2024-07-18", ...GPT_4O_MINI },
    // QA-07.3.1 — the scope classifier model: $0.10 input / $0.01 cached
    // input / $0.50 output per 1M tokens (official OpenAI pricing).
    { model: "gpt-6-luna", inputMicroUsdPer1M: 100_000, cachedInputMicroUsdPer1M: 10_000, outputMicroUsdPer1M: 500_000 },
  ],
  // Responses API file_search: $2.50 / 1 000 calls — an ADDITIONAL fee; the
  // retrieved content is already billed as model input tokens.
  tools: { fileSearchMicroUsdPer1kCalls: 2_500_000 },
};

/** EXACT id match only. null = no configured price (stays unpriced). */
export function resolveModelPrice(model: string, registry: PricingRegistry = METRIC_PRICING): ModelPrice | null {
  return registry.models.find((m) => m.model === model) ?? null;
}

export interface UsageForPricing {
  model: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  fileSearchCalls: number;
}

export type PricedCost = { costMicroUsd: number; pricingVersion: string } | { costMicroUsd: null; pricingVersion: null };

const UNPRICED: PricedCost = { costMicroUsd: null, pricingVersion: null };

function divRoundHalfUp(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (d * 2n);
}

/**
 * The cost of ONE call at the current registry, or UNPRICED when any part of
 * it has no configured price (unknown model, missing provider usage, or
 * file_search calls with no tool price) — a partial sum would understate.
 */
export function priceMetricUsage(u: UsageForPricing, registry: PricingRegistry = METRIC_PRICING): PricedCost {
  if (u.inputTokens == null || u.outputTokens == null) return UNPRICED;
  const price = resolveModelPrice(u.model, registry);
  if (!price) return UNPRICED;
  if (u.fileSearchCalls > 0 && !registry.tools) return UNPRICED;

  const cached = BigInt(Math.min(Math.max(u.cachedInputTokens ?? 0, 0), u.inputTokens));
  const uncached = BigInt(u.inputTokens) - cached;
  const cachedPrice = BigInt(price.cachedInputMicroUsdPer1M ?? price.inputMicroUsdPer1M);
  const tokenPart =
    uncached * BigInt(price.inputMicroUsdPer1M) + cached * cachedPrice + BigInt(u.outputTokens) * BigInt(price.outputMicroUsdPer1M);
  // Scale everything to "micro-USD × 1 000 000" so ONE rounding happens.
  const toolPart = registry.tools ? BigInt(u.fileSearchCalls) * BigInt(registry.tools.fileSearchMicroUsdPer1kCalls) * 1000n : 0n;
  const cost = divRoundHalfUp(tokenPart + toolPart, 1_000_000n);
  return { costMicroUsd: Number(cost), pricingVersion: registry.version };
}

/** 1 234 567 micro-USD → "$1.23"; sub-cent amounts keep 4 decimals ("$0.0042"). */
export function formatMicroUsd(micro: number): string {
  const usd = micro / 1_000_000;
  if (micro > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
