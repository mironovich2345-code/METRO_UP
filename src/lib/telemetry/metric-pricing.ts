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
 * IMPORTANT — the registries below are deliberately EMPTY: no provider price
 * is recorded anywhere authoritative in this repository, and prices must not
 * be guessed. Until a VERIFIED price is added here, every call is stored with
 * its real tokens and `costMicroUsd = null` (UNPRICED) and the admin UI says
 * so — it never shows $0. To configure: add an entry with the provider's
 * published price, bump PRICING_VERSION, and note the source + date.
 */

export interface ModelPrice {
  /** Exact provider model id, or its undated alias (see resolveModelPrice). */
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
export const PRICING_VERSION = "unconfigured";

export const METRIC_PRICING: PricingRegistry = {
  version: PRICING_VERSION,
  models: [],
  tools: null,
};

/** Provider snapshots carry a date suffix (`gpt-4o-mini-2024-07-18`). */
const DATED_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;

/** Exact id first, then the undated alias. null = no configured price. */
export function resolveModelPrice(model: string, registry: PricingRegistry = METRIC_PRICING): ModelPrice | null {
  const exact = registry.models.find((m) => m.model === model);
  if (exact) return exact;
  const alias = model.replace(DATED_SUFFIX, "");
  return alias !== model ? registry.models.find((m) => m.model === alias) ?? null : null;
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
