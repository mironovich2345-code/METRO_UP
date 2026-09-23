/**
 * Temporary iOS bootstrap telemetry (observability only — no behaviour change).
 * A problematic iPhone can sit on the boot loader >9s even though the server
 * finishes /api/auth/telegram in ~720ms; these client phase beacons (sent to our
 * own backend) reveal exactly where the client stalls.
 *
 * STRICT PRIVACY: only the whitelisted fields below ever leave the client. No
 * initData, telegramId, userId, name, username, phone, session token, or cookie
 * values — sanitizeBootstrapDiag() drops everything not on the allow-list.
 */

export type BootstrapPhase =
  | "client_mounted"
  | "sdk_found"
  | "initdata_found"
  | "bootstrap_start"
  | "auth_fetch_start"
  | "auth_fetch_headers"
  | "auth_body_start"
  | "auth_body_parsed"
  | "authenticate_returned"
  | "status_authenticated"
  | "profile_received"
  | "gate_ready"
  | "auth_error"
  | "auth_timeout"
  | "provider_unmounted";

/** The ONLY fields allowed to be logged. Everything else is dropped. */
export interface BootstrapDiag {
  phase: string;
  durationMs?: number;
  platform?: string;
  pathname?: string;
  buildSha?: string;
  attemptId?: string;
}

/**
 * Whitelist-only sanitizer (pure, unit-tested). Returns a safe object with ONLY
 * the allowed fields (length-capped), or null if there is no valid `phase`. Any
 * sensitive/unknown field (initData, telegramId, token, name, …) is discarded.
 */
export function sanitizeBootstrapDiag(raw: unknown): BootstrapDiag | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.phase !== "string" || o.phase.trim() === "") return null;
  const out: BootstrapDiag = { phase: o.phase.slice(0, 40) };
  if (typeof o.durationMs === "number" && Number.isFinite(o.durationMs)) out.durationMs = Math.round(o.durationMs);
  if (typeof o.platform === "string") out.platform = o.platform.slice(0, 40);
  if (typeof o.pathname === "string") out.pathname = o.pathname.slice(0, 120);
  if (typeof o.buildSha === "string") out.buildSha = o.buildSha.slice(0, 64);
  if (typeof o.attemptId === "string") out.attemptId = o.attemptId.slice(0, 64);
  return out;
}

/** Build identifier so we can prove which JS the device is actually running. */
export function getBuildSha(): string {
  return process.env.NEXT_PUBLIC_BUILD_SHA?.trim() || "unknown";
}

/** Random, non-personal id shared by all phases of one bootstrap attempt. */
export function newAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safePlatform(): string | undefined {
  try {
    return typeof navigator !== "undefined" ? navigator.platform || undefined : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget beacon to /api/diag/bootstrap. NEVER throws, never awaits, and
 * never affects bootstrap — telemetry failure is swallowed. Prefers sendBeacon,
 * falls back to keepalive fetch.
 */
export function sendBootstrapDiag(event: BootstrapDiag): void {
  try {
    if (typeof window === "undefined") return;
    const payload = sanitizeBootstrapDiag({
      ...event,
      platform: event.platform ?? safePlatform(),
      pathname: event.pathname ?? window.location?.pathname,
      buildSha: event.buildSha ?? getBuildSha(),
    });
    if (!payload) return;
    const body = JSON.stringify(payload);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/api/diag/bootstrap", blob)) return;
      }
    } catch {
      /* fall through to fetch */
    }
    void fetch("/api/diag/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry must never break bootstrap */
  }
}
