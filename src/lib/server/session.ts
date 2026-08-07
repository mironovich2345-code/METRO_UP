import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getServerEnv, isProduction } from "./env";
import {
  SESSION_COOKIE,
  buildSessionCookieOptions,
  signSessionToken,
  verifySessionToken as verifyToken,
} from "./session-token";

/**
 * Stateless, signed session stored in an HttpOnly cookie (never localStorage).
 * The cookie carries only the user id + expiry, HMAC-signed with AUTH_SECRET.
 * Signing/verification primitives live in ./session-token (unit-tested).
 */

export { SESSION_COOKIE };

export function createSessionToken(userId: string): string {
  return signSessionToken(userId, getServerEnv().AUTH_SECRET);
}

export function verifySessionToken(token: string | undefined): string | null {
  return verifyToken(token, getServerEnv().AUTH_SECRET);
}

export function sessionCookieOptions() {
  return buildSessionCookieOptions(isProduction());
}

/** Read the authenticated user id from the request cookie, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Server-side current user (with employee profile), resolved from the session
 * cookie. All future APIs must derive identity from here, never from a
 * client-supplied employeeId.
 */
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    include: { employeeProfile: true },
  });
}
