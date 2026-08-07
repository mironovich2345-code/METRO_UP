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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "error", data?.fields);
  }
  return data as T;
}

/** Verify Telegram initData server-side and open a session. */
export async function authenticateTelegram(
  initData: string,
): Promise<AppUserDTO> {
  const { user } = await apiFetch<{ user: AppUserDTO }>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
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
