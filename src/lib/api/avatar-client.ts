import { ApiError } from "./client";

/**
 * METRO UP ROUND 1, Milestone 1 — avatar upload client. Same request/
 * ApiError shape as every other *-client.ts in this codebase; same-origin,
 * session-cookie auth, no userId ever sent from the client (the server
 * derives the target from the session — see avatar.ts).
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

interface AvatarUploadTicket {
  uploadUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

/** Full upload flow: ask the server for a signed PUT ticket, PUT the blob
 * DIRECTLY to storage (never through our own server), then ask the server
 * to confirm + commit it as the avatar. Three network calls, the middle one
 * going straight to the storage provider, not /api/*. */
export async function uploadAvatar(blob: Blob, contentType: string): Promise<{ avatarUrl: string }> {
  const ticket = await request<AvatarUploadTicket>("/api/profile/avatar/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType, sizeBytes: blob.size }),
  });

  const putRes = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.requiredHeaders,
    body: blob,
  });
  if (!putRes.ok) throw new ApiError(putRes.status, "upload_failed");

  return request<{ avatarUrl: string }>("/api/profile/avatar/complete", {
    method: "POST",
    body: JSON.stringify({ storageKey: ticket.storageKey }),
  });
}
