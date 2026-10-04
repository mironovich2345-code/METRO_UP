import { ApiError } from "./client";
import type {
  CreateQuestionRequestDTO,
  EmployeeQuestionDTO,
  ListQuestionsRequestDTO,
  ListQuestionsResponseDTO,
  QuestionAttachmentUploadTicketDTO,
  QuestionStatusDTO,
} from "./questions-types";

/**
 * METRO UP ROUND 1, Milestone 2B — Employee Questions client. Same request/
 * ApiError shape as every other *-client.ts in this codebase; same-origin,
 * session-cookie auth, no userId ever sent from the client.
 */
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

export const questionsApi = {
  requestAttachmentUpload: (input: { contentType: string; sizeBytes: number }) =>
    request<QuestionAttachmentUploadTicketDTO>("/api/questions/attachments/upload-url", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Uploads DIRECTLY to storage via the ticket's signed URL — never
   * through our own server (section 5/6). */
  uploadAttachmentBlob: async (ticket: QuestionAttachmentUploadTicketDTO, file: File) => {
    const res = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.requiredHeaders, body: file });
    if (!res.ok) throw new ApiError(res.status, "upload_failed");
  },

  create: (input: CreateQuestionRequestDTO) =>
    request<{ question: EmployeeQuestionDTO }>("/api/questions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** METRO UP ROUND 1, Milestone 3 — role-neutral list; behavior is
   * entirely server-derived from the actor's current context (GET
   * /api/questions's own docstring). `status: undefined` (the "Все" tab)
   * omits the query param entirely, matching the server's "no filter" read. */
  list: (filter: ListQuestionsRequestDTO = {}) => {
    const sp = new URLSearchParams();
    if (filter.status) sp.set("status", filter.status);
    if (filter.category) sp.set("category", filter.category);
    if (filter.clubId) sp.set("clubId", filter.clubId);
    if (filter.page) sp.set("page", String(filter.page));
    if (filter.limit) sp.set("limit", String(filter.limit));
    const qs = sp.toString();
    return request<ListQuestionsResponseDTO>(`/api/questions${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => request<{ question: EmployeeQuestionDTO }>(`/api/questions/${id}`),

  updateStatus: (id: string, status: QuestionStatusDTO) =>
    request<{ question: EmployeeQuestionDTO }>(`/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

/** METRO UP ROUND 1, Milestone 3, section 7 — the download PROXY's own
 * path, never a storage URL (see the route's docstring). Safe to use
 * directly as an <img src> or <a href>/window.open target — same-origin,
 * session-cookie auth, no token/signature of any kind in this URL. */
export function questionAttachmentDownloadUrl(attachmentId: string): string {
  return `/api/questions/attachments/${attachmentId}/download`;
}
