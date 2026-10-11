import { ApiError } from "./client";

/**
 * Sprint: LIVE QA QA-04, section D — the smallest authenticated binary fetch.
 *
 * How protected Mini App requests authenticate (traced, not assumed): the
 * Mini App posts Telegram initData ONCE to /api/auth/telegram, which sets the
 * httpOnly, SameSite=Lax `metro_session` cookie (session-token.ts); every
 * later API call is a same-origin fetch with `credentials: "same-origin"`
 * and no Authorization header (client.ts's apiFetch, questions-client.ts's
 * request). That cookie lives in the Mini App's WebView only. Opening the
 * same URL through a link hands it to Telegram's external browser, which has
 * no such cookie — hence {"error":"unauthorized"}.
 *
 * So the bytes are fetched HERE, inside the WebView, the same way as every
 * other protected call, and handed to the caller as a Blob. Nothing is added
 * to the URL (no token, no query string), and only same-origin `/api/` paths
 * are accepted.
 */
export async function fetchProtectedBlob(path: string, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("//")) {
    throw new ApiError(400, "invalid_protected_path");
  }
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: init.signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { error?: string })?.error ?? "error");
  }
  return res.blob();
}
