import crypto from "node:crypto";

/**
 * Pure View As token primitives (Sprint 1 / Phase 2B, section 12/16) — same
 * HMAC-signed, base64url payload shape as session-token.ts, but deliberately
 * NOT sharing its private sign()/b64url() helpers: the two payloads differ
 * enough (uid+iat+exp vs realUserId+role+scope+iat+exp) that forcing a shared
 * abstraction across two files that were never designed together would cost
 * more clarity than the ~10 duplicated lines are worth. No DB / server-only
 * import here, so this is directly unit-testable like session-token.ts.
 *
 * Separate cookie from the real session (metro_session) — starting/ending a
 * preview NEVER touches the real session, and the real session's identity
 * (getCurrentUser()) is unaffected by this cookie's presence either way.
 */
export const VIEW_AS_COOKIE = "metro_view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 30 * 60; // 30 minutes — short-lived by design

export type ViewAsRole = "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";

export interface ViewAsPayload {
  /** The REAL user's id (from the actual session) — never trusted from the
   * client; resolveViewContext() cross-checks this against getCurrentUser(). */
  realUserId: string;
  role: ViewAsRole;
  clubId: string | null;
  cityId: string | null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signViewAsToken(
  payload: ViewAsPayload,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const full = { ...payload, iat: nowSeconds, exp: nowSeconds + VIEW_AS_MAX_AGE_SECONDS };
  const payloadB64 = b64url(JSON.stringify(full));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function verifyViewAsToken(
  token: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ViewAsPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof payload.realUserId !== "string") return null;
    if (payload.role !== "MANAGER" && payload.role !== "CLUB_MANAGER" && payload.role !== "CITY_MANAGER") return null;
    if (typeof payload.exp !== "number" || payload.exp < nowSeconds) return null;
    return {
      realUserId: payload.realUserId,
      role: payload.role,
      clubId: typeof payload.clubId === "string" ? payload.clubId : null,
      cityId: typeof payload.cityId === "string" ? payload.cityId : null,
    };
  } catch {
    return null;
  }
}

export interface ViewAsCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function buildViewAsCookieOptions(isProduction: boolean): ViewAsCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
  };
}
