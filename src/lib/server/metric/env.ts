import "server-only";
import { resolveMaxOutputTokens } from "./token-policy";

/**
 * Metric AI configuration. All values are read lazily at request time (never at
 * build time) and the OpenAI key is NEVER exposed to the client. Missing/invalid
 * config degrades gracefully — the feature simply reports "not ready".
 */
export interface MetricEnv {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  maxOutputTokens: number;
  vectorStoreId: string | null;
}

/** Sensible current default compatible with the Responses API + file_search. */
export const DEFAULT_MODEL = "gpt-4o-mini";

export function getMetricEnv(): MetricEnv {
  return {
    enabled: (process.env.METRIC_AI_ENABLED ?? "").trim().toLowerCase() === "true",
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    maxOutputTokens: resolveMaxOutputTokens(process.env.OPENAI_MAX_OUTPUT_TOKENS),
    vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID?.trim() || null,
  };
}

/** Live chat requires the flag ON and both an API key and a vector store. */
export function isMetricReady(env: MetricEnv = getMetricEnv()): boolean {
  return env.enabled && Boolean(env.apiKey) && Boolean(env.vectorStoreId);
}

/** Sync needs the key (a vector store can be created by the setup command). */
export function canSync(env: MetricEnv = getMetricEnv()): boolean {
  return Boolean(env.apiKey);
}
