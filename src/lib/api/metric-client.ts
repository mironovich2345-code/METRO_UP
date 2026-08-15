import { ApiError } from "./client";
import type { MetricConversationDTO, MetricChatResultDTO, MetricStatusDTO } from "./metric-types";

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

export const metricApi = {
  conversation: () => request<MetricConversationDTO>("/api/metric/conversation"),
  chat: (text: string, conversationId?: string) =>
    request<MetricChatResultDTO>("/api/metric/chat", { method: "POST", body: JSON.stringify({ text, conversationId }) }),
  // ADMIN
  status: () => request<MetricStatusDTO>("/api/control/metric/status"),
  sync: () => request<{ synced: number; removed: number }>("/api/control/metric/sync", { method: "POST" }),
};
