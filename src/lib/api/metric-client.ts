import { ApiError } from "./client";
import type {
  MetricConversationDTO, MetricChatResultDTO, MetricStatusDTO,
  MetricDocumentsPayload, MetricDocumentDetailDTO,
} from "./metric-types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  return data as T;
}

/** Multipart request — never set Content-Type so the browser adds the boundary. */
async function requestForm<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch(path, { method, body: form, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  return data as T;
}

export interface ChatStreamHandlers {
  /** Called for every incremental text chunk (append to the same bubble). */
  onDelta: (text: string) => void;
  /** Called once with the persisted final message when the stream completes. */
  onDone: (result: MetricChatResultDTO) => void;
  /** Called on a transport/HTTP/stream error. */
  onError: (err: ApiError) => void;
}

/** Dispatch one parsed SSE payload to the right handler. */
function dispatchChatEvent(payload: unknown, h: ChatStreamHandlers): void {
  if (!payload || typeof payload !== "object") return;
  const ev = payload as { type?: string; text?: string; code?: string; conversationId?: string; message?: unknown; rolePlayActive?: boolean };
  if (ev.type === "delta" && typeof ev.text === "string") h.onDelta(ev.text);
  else if (ev.type === "done" && ev.conversationId && ev.message) {
    h.onDone({ conversationId: ev.conversationId, message: ev.message as MetricChatResultDTO["message"], rolePlayActive: ev.rolePlayActive ?? false });
  } else if (ev.type === "error") h.onError(new ApiError(502, ev.code ?? "ai_error"));
}

/** Parse one SSE block (its `data:` lines) and dispatch it. */
function handleSSEBlock(block: string, h: ChatStreamHandlers): void {
  const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
  if (!data) return;
  let payload: unknown;
  try { payload = JSON.parse(data); } catch { return; }
  dispatchChatEvent(payload, h);
}

/**
 * Stream a chat answer over Server-Sent Events. Deltas arrive incrementally;
 * exactly one `onDone` (with the persisted message) or one `onError` fires.
 */
async function chatStream(text: string, conversationId: string | undefined, h: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/metric/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, conversationId }),
      signal,
    });
  } catch {
    h.onError(new ApiError(0, "network_error"));
    return;
  }
  if (!res.ok || !res.body) {
    const err = await res.json?.().catch(() => ({} as { error?: string; fields?: unknown })) ?? {};
    h.onError(new ApiError(res.status || 500, (err as { error?: string }).error ?? "error", (err as { fields?: Record<string, string> }).fields));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        handleSSEBlock(buffer.slice(0, idx), h);
        buffer = buffer.slice(idx + 2);
      }
    }
    if (buffer.trim()) handleSSEBlock(buffer, h);
  } catch {
    h.onError(new ApiError(0, "stream_interrupted"));
  }
}

export const metricApi = {
  conversation: () => request<MetricConversationDTO>("/api/metric/conversation"),
  chatStream,
  continue: (conversationId: string) =>
    request<MetricChatResultDTO>("/api/metric/chat/continue", { method: "POST", body: JSON.stringify({ conversationId }) }),
  // ADMIN
  status: () => request<MetricStatusDTO>("/api/control/metric/status"),
  sync: () => request<{ synced: number; removed: number }>("/api/control/metric/sync", { method: "POST" }),
};

export const documentsAdminApi = {
  list: () => request<MetricDocumentsPayload>("/api/control/metric/documents"),
  get: (id: string) => request<{ document: MetricDocumentDetailDTO }>(`/api/control/metric/documents/${id}`),
  create: (form: FormData) => requestForm<{ document: MetricDocumentDetailDTO }>("/api/control/metric/documents", form),
  update: (id: string, body: Record<string, unknown>) =>
    request<{ document: MetricDocumentDetailDTO }>(`/api/control/metric/documents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  replaceFile: (id: string, form: FormData) => requestForm<{ document: MetricDocumentDetailDTO }>(`/api/control/metric/documents/${id}/file`, form),
  publish: (id: string) => request<{ document: MetricDocumentDetailDTO }>(`/api/control/metric/documents/${id}/publish`, { method: "POST" }),
  setStatus: (id: string, status: "DRAFT" | "ARCHIVED") =>
    request<{ document: MetricDocumentDetailDTO }>(`/api/control/metric/documents/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  downloadUrl: (id: string) => request<{ url: string }>(`/api/control/metric/documents/${id}/download`),
};
