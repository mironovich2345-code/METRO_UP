import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE, verifyViewAsToken } from "@/lib/server/view-as-token";

/**
 * Sprint 1 / Phase 2C, Blocker #1 — "View As must be globally read-only".
 * Phase 2B's requireNoActiveViewAs() only guarded control/roles/**; this is
 * the centralized, whole-app version, at the single most centralized layer
 * this project has for intercepting a request before ANY route handler runs.
 * (apiHandler() in http.ts exists but is not actually used by any route —
 * confirmed by grep before choosing this approach — so it could not have
 * been "the" central layer without first retrofitting every route to use it,
 * a much larger and riskier change than the brief asked for. Next.js
 * middleware is the framework's own answer to "run before every matched
 * request, no route can opt out by forgetting to call something".)
 *
 * Deliberately DB-free and does not re-validate View-As scope against
 * current RoleAssignment grants — that precise, DB-backed check is still
 * resolveViewContext()'s job (rbac/view-as.ts), called inside route handlers
 * for the effective READ context. This layer only answers one coarse
 * question — "does a validly-signed view-as cookie exist for this request
 * at all" — and if so, blocks the mutation outright. A stricter, scope-aware
 * per-route check is strictly redundant on top of this, never a replacement
 * for it.
 *
 * Uses view-as-token.ts's Web-Crypto-based verify (not node:crypto) so this
 * keeps working regardless of which runtime Next.js executes middleware on.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Minimal allowlist — every entry justified individually, not a broad
 * `/api/control/*` or `/api/auth/*` exemption:
 * - view-as/end: must always work, or a user could get stuck previewing.
 * - view-as/start: switching directly to a different preview (without first
 *   ending the current one) is what View As itself does, not a business
 *   mutation it should block.
 * - auth/logout, auth/telegram(-web): identity/session management must
 *   always work regardless of any stale or active preview cookie — these
 *   never write business data.
 */
const ALLOWLIST = new Set([
  "/api/control/view-as/end",
  "/api/control/view-as/start",
  "/api/auth/logout",
  "/api/auth/telegram",
  "/api/auth/telegram-web",
]);

export async function middleware(req: NextRequest) {
  if (!MUTATING_METHODS.has(req.method)) return NextResponse.next();
  if (ALLOWLIST.has(req.nextUrl.pathname)) return NextResponse.next();

  const token = req.cookies.get(VIEW_AS_COOKIE)?.value;
  if (!token) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next(); // fails open only in the sense that sessions are already broken app-wide without it

  const payload = await verifyViewAsToken(token, secret);
  if (!payload) return NextResponse.next(); // expired/tampered/foreign token — nothing active to guard

  return NextResponse.json({ error: "VIEW_AS_READ_ONLY", message: "Действие недоступно в режиме просмотра" }, { status: 403 });
}

export const config = {
  matcher: ["/api/:path*"],
};
