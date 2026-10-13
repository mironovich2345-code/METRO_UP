/**
 * Sprint: LIVE QA QA-07 — turning ONE provider response into ONE
 * MetricUsageEvent row (pure; unit-tested). Tokens come only from the
 * provider's reported usage; the model is the one the provider reports it ran
 * (falling back to the requested id); cost is priced NOW and persisted. No
 * prompt or answer text is ever part of the event.
 */
import type { CreateResponseResult } from "@/lib/server/metric/openai-parse";
import { METRIC_PRICING, priceMetricUsage, type PricingRegistry } from "./metric-pricing";

export type MetricUsageKindValue = "CHAT" | "CONTINUE" | "SCOPE_CHECK";

export interface MetricUsageEventInput {
  provider: string;
  model: string;
  kind: MetricUsageKindValue;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  fileSearchCalls: number;
  costMicroUsd: number | null;
  pricingVersion: string | null;
  userId: string | null;
  conversationId: string | null;
  messageId: string | null;
}

export const METRIC_PROVIDER = "openai";

export function buildMetricUsageEvent(
  result: Pick<CreateResponseResult, "usage" | "model" | "fileSearchCalls">,
  ctx: { kind: MetricUsageKindValue; requestedModel: string; userId: string | null; conversationId: string | null; messageId: string | null },
  registry: PricingRegistry = METRIC_PRICING,
): MetricUsageEventInput {
  const model = result.model || ctx.requestedModel;
  const u = result.usage;
  const inputTokens = u ? u.inputTokens : null;
  const outputTokens = u ? u.outputTokens : null;
  const cachedInputTokens = u ? u.cachedInputTokens ?? 0 : null;
  const totalTokens = u ? u.totalTokens ?? u.inputTokens + u.outputTokens : null;
  const fileSearchCalls = result.fileSearchCalls ?? 0;
  const priced = priceMetricUsage({ model, inputTokens, cachedInputTokens, outputTokens, fileSearchCalls }, registry);
  return {
    provider: METRIC_PROVIDER,
    model,
    kind: ctx.kind,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    fileSearchCalls,
    costMicroUsd: priced.costMicroUsd,
    pricingVersion: priced.pricingVersion,
    userId: ctx.userId,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
  };
}

/**
 * Persist an event WITHOUT ever failing the caller: the employee's answer is
 * the primary outcome; a telemetry write error is logged (safe fields only)
 * and swallowed. Provider errors never reach here — they are thrown before.
 */
export async function recordMetricUsageSafely(
  write: (e: MetricUsageEventInput) => Promise<unknown>,
  event: MetricUsageEventInput,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<boolean> {
  try {
    await write(event);
    return true;
  } catch (e) {
    log(`[telemetry] metric_usage_write_failed kind=${event.kind} model=${event.model} err=${e instanceof Error ? e.name : "unknown"}`);
    return false;
  }
}
