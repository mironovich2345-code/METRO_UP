import { ApiError } from "./client";
import type {
  MetricConversationDTO, MetricChatResultDTO, MetricStatusDTO,
  MetricDocumentsPayload, MetricDocumentDetailDTO, EmployeeDocumentDTO,
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

export const metricApi = {
  conversation: () => request<MetricConversationDTO>("/api/metric/conversation"),
  chat: (text: string, conversationId?: string) =>
    request<MetricChatResultDTO>("/api/metric/chat", { method: "POST", body: JSON.stringify({ text, conversationId }) }),
  continue: (conversationId: string) =>
    request<MetricChatResultDTO>("/api/metric/chat/continue", { method: "POST", body: JSON.stringify({ conversationId }) }),
  document: (id: string) => request<{ document: EmployeeDocumentDTO }>(`/api/knowledge/documents/${id}`),
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
