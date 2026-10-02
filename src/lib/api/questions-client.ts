import { ApiError } from "./client";
import type { CreateQuestionRequestDTO, EmployeeQuestionDTO, QuestionAttachmentUploadTicketDTO } from "./questions-types";

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
};
