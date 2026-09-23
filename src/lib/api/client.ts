import type {
  AppUserDTO,
  OnboardingInputDTO,
} from "./types";

/** Thrown for non-2xx API responses. Carries a safe code + optional field errors. */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, code: string, fields?: Record<string, string>) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Optional, behaviour-NEUTRAL transport phase hook (observability only). It only
 * emits markers between the existing awaits — it never changes control flow,
 * timing, or the result. Used to locate where an iOS request stalls.
 */
export type FetchPhase = "fetch_start" | "fetch_headers" | "body_start" | "body_parsed";

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  onPhase?: (phase: FetchPhase) => void,
): Promise<T> {
  onPhase?.("fetch_start");
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  onPhase?.("fetch_headers");
  onPhase?.("body_start");
  const data = await res.json().catch(() => ({}));
  onPhase?.("body_parsed");
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  }
  return data as T;
}

/**
 * Verify Telegram initData server-side and open a session. Accepts an AbortSignal
 * so the caller can enforce a hard bootstrap timeout (the request is aborted, not
 * left as an orphan) — see AppUserProvider. `onPhase` is observability-only.
 */
export async function authenticateTelegram(
  initData: string,
  signal?: AbortSignal,
  onPhase?: (phase: FetchPhase) => void,
): Promise<AppUserDTO> {
  const { user } = await apiFetch<{ user: AppUserDTO }>(
    "/api/auth/telegram",
    { method: "POST", body: JSON.stringify({ initData }), signal },
    onPhase,
  );
  return user;
}

/** Current session user, or null when unauthenticated (401). */
export async function fetchMe(): Promise<AppUserDTO | null> {
  try {
    const { user } = await apiFetch<{ user: AppUserDTO }>("/api/auth/me");
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

/** Persist onboarding; server owns careerLevel/accessStatus/onboardingCompleted. */
export async function submitOnboarding(
  input: OnboardingInputDTO,
): Promise<AppUserDTO> {
  const { user } = await apiFetch<{ user: AppUserDTO }>(
    "/api/profile/onboarding",
    { method: "POST", body: JSON.stringify(input) },
  );
  return user;
}
