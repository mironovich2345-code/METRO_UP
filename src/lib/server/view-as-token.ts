/**
 * Pure View As token primitives (Sprint 1 / Phase 2C) — same HMAC-signed,
 * base64url payload shape as session-token.ts, but built on the Web Crypto
 * API (`crypto.subtle`) instead of `node:crypto`. This is deliberate, not
 * incidental: src/middleware.ts (Phase 2C's global read-only guard) needs to
 * verify this token BEFORE any route handler runs, and Next.js middleware
 * may execute on the Edge runtime, which has no `node:crypto` — `node:crypto`
 * would crash there with a bundler/runtime error at deploy time, not a type
 * error caught in this sandbox. Web Crypto is available in both the Edge
 * runtime and Node.js 20+ (this project targets Node >=22.13.0), so ONE
 * implementation is correct everywhere it's imported — routes
 * (rbac/view-as.ts) and middleware both call these same two functions.
 *
 * HMAC-SHA256 is a standard, deterministic algorithm — Web Crypto's output
 * for a given (secret, message) is byte-identical to node:crypto's, so this
 * interoperates with any token issued before this rewrite (none exist yet in
 * production; Phase 2B never shipped past this sandbox).
 *
 * No DB / server-only import, so this remains directly unit-testable exactly
 * like session-token.ts — the sign/verify functions are now async (Web
 * Crypto's API is Promise-based), which is the only call-site-visible change.
 */
export const VIEW_AS_COOKIE = "metro_view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 30 * 60; // 30 minutes — short-lived by design

export type ViewAsRole = "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";

/** Sprint 1 / Phase 2D — mirrors prisma.EmployeePosition. Not imported from
 * @prisma/client here on purpose: this file is also loaded by Edge-runtime
 * middleware, which cannot pull in the full Prisma client. */
export type ViewAsPosition = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";

export interface ViewAsPayload {
  /** The REAL user's id (from the actual session) — never trusted from the
   * client; resolveViewContext() cross-checks this against getCurrentUser(). */
  realUserId: string;
  role: ViewAsRole;
  clubId: string | null;
  cityId: string | null;
  /**
   * Sprint 1 / Phase 2D — which EmployeePosition the synthetic Mini-App
   * persona reads as, for position-gated content (Scripts —
   * knowledge-access.ts's SCRIPT_POSITIONS). EmployeePosition has no
   * canonical "this is what a manager sees" value (CLIENT_MANAGER,
   * NIGHT_MANAGER, and ADMINISTRATOR are three distinct, non-overlapping
   * employee positions — see src/content/positions.ts), so this is never
   * guessed: role=MANAGER requires the caller to pass one explicitly
   * (startViewAsSchema); role=CLUB_MANAGER/CITY_MANAGER default it to
   * ADMINISTRATOR (their preview surface is Team/Control, not
   * position-gated Mini-App content, but the persona object still needs a
   * concrete value). Set once at startViewAs() and signed into the token —
   * never re-suppliable per-request, so it can't drift mid-preview.
   */
  previewPositionId: ViewAsPosition;
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(padded);
  // Allocate a plain (non-shared) ArrayBuffer explicitly — crypto.subtle's
  // BufferSource types reject the wider Uint8Array<ArrayBufferLike> that a
  // bare `new Uint8Array(n)` infers to under TS's newer typed-array generics.
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payloadB64: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return b64url(sig);
}

export async function signViewAsToken(
  payload: ViewAsPayload,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const full = { ...payload, iat: nowSeconds, exp: nowSeconds + VIEW_AS_MAX_AGE_SECONDS };
  const payloadB64 = b64url(JSON.stringify(full));
  return `${payloadB64}.${await sign(payloadB64, secret)}`;
}

export async function verifyViewAsToken(
  token: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<ViewAsPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let sigMatches: boolean;
  try {
    const key = await hmacKey(secret);
    sigMatches = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(payloadB64));
  } catch {
    return null;
  }
  if (!sigMatches) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (typeof payload.realUserId !== "string") return null;
    if (payload.role !== "MANAGER" && payload.role !== "CLUB_MANAGER" && payload.role !== "CITY_MANAGER") return null;
    if (typeof payload.exp !== "number" || payload.exp < nowSeconds) return null;
    const previewPositionId: ViewAsPosition =
      payload.previewPositionId === "CLIENT_MANAGER" ||
      payload.previewPositionId === "NIGHT_MANAGER" ||
      payload.previewPositionId === "ADMINISTRATOR"
        ? payload.previewPositionId
        : "ADMINISTRATOR"; // tokens signed before this field existed fall back safely
    return {
      realUserId: payload.realUserId,
      role: payload.role,
      clubId: typeof payload.clubId === "string" ? payload.clubId : null,
      cityId: typeof payload.cityId === "string" ? payload.cityId : null,
      previewPositionId,
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
