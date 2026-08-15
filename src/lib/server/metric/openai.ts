import "server-only";

/**
 * Minimal server-only OpenAI transport (Responses API + Files + Vector Stores).
 * All OpenAI HTTP lives here behind the `MetricTransport` interface so it can be
 * mocked in tests and swapped for the official `openai` SDK without touching call
 * sites. The API key is read here and NEVER returned to any caller/client.
 */

import { parseResponsePayload, type CreateResponseResult } from "./openai-parse";
export { parseResponsePayload };
export type { CreateResponseResult };

const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

export type KnowledgeAttributes = Record<string, string | number | boolean>;

/** OpenAI file_search attribute filter (comparison or compound). */
export type ResponseFilter =
  | { type: "eq" | "ne" | "gt" | "gte" | "lt" | "lte"; key: string; value: string | number | boolean }
  | { type: "and" | "or"; filters: ResponseFilter[] };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CreateResponseInput {
  model: string;
  instructions: string;
  messages: ChatMessage[];
  vectorStoreId: string;
  filters?: ResponseFilter;
  maxOutputTokens: number;
  maxNumResults?: number;
}

export interface MetricTransport {
  createResponse(input: CreateResponseInput, signal?: AbortSignal): Promise<CreateResponseResult>;
  uploadKnowledgeFile(filename: string, content: string): Promise<{ fileId: string }>;
  attachToVectorStore(vectorStoreId: string, fileId: string, attributes: KnowledgeAttributes): Promise<{ vectorStoreFileId: string }>;
  removeFromVectorStore(vectorStoreId: string, fileId: string): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
  createVectorStore(name: string): Promise<{ id: string }>;
}

/** A safe, non-sensitive error message. Never includes the key or full payload. */
export class MetricOpenAiError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.name = "MetricOpenAiError";
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>, external?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  external?.addEventListener("abort", onAbort);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

export function httpTransport(apiKey: string, timeoutMs = DEFAULT_TIMEOUT_MS): MetricTransport {
  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  async function jsonRequest(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const res = await withTimeout(
      timeoutMs,
      (s) => fetch(`${OPENAI_BASE}${path}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: s,
      }),
      signal,
    );
    if (!res.ok) throw new MetricOpenAiError(res.status, `openai_${res.status}`);
    return res.json();
  }

  return {
    async createResponse(input, signal) {
      const tool: Record<string, unknown> = {
        type: "file_search",
        vector_store_ids: [input.vectorStoreId],
        max_num_results: input.maxNumResults ?? 6,
      };
      if (input.filters) tool.filters = input.filters;
      const data = await jsonRequest("/responses", {
        model: input.model,
        instructions: input.instructions,
        input: input.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: [tool],
        max_output_tokens: input.maxOutputTokens,
      }, signal);
      return parseResponsePayload(data);
    },

    async uploadKnowledgeFile(filename, content) {
      const fd = new FormData();
      fd.append("purpose", "assistants");
      fd.append("file", new Blob([content], { type: "text/plain" }), filename);
      const res = await withTimeout(timeoutMs, (s) =>
        fetch(`${OPENAI_BASE}/files`, { method: "POST", headers: authHeaders, body: fd, signal: s }),
      );
      if (!res.ok) throw new MetricOpenAiError(res.status, `openai_files_${res.status}`);
      const j = (await res.json()) as { id: string };
      return { fileId: j.id };
    },

    async attachToVectorStore(vectorStoreId, fileId, attributes) {
      const j = (await jsonRequest(`/vector_stores/${vectorStoreId}/files`, { file_id: fileId, attributes })) as { id: string };
      return { vectorStoreFileId: j.id };
    },

    async removeFromVectorStore(vectorStoreId, fileId) {
      const res = await withTimeout(timeoutMs, (s) =>
        fetch(`${OPENAI_BASE}/vector_stores/${vectorStoreId}/files/${fileId}`, { method: "DELETE", headers: authHeaders, signal: s }),
      );
      if (!res.ok && res.status !== 404) throw new MetricOpenAiError(res.status, `openai_vsdel_${res.status}`);
    },

    async deleteFile(fileId) {
      const res = await withTimeout(timeoutMs, (s) =>
        fetch(`${OPENAI_BASE}/files/${fileId}`, { method: "DELETE", headers: authHeaders, signal: s }),
      );
      if (!res.ok && res.status !== 404) throw new MetricOpenAiError(res.status, `openai_filedel_${res.status}`);
    },

    async createVectorStore(name) {
      const j = (await jsonRequest("/vector_stores", { name })) as { id: string };
      return { id: j.id };
    },
  };
}
