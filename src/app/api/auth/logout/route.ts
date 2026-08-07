import { jsonOk } from "@/lib/server/http";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — clear the session cookie. */
export async function POST() {
  const res = jsonOk({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
