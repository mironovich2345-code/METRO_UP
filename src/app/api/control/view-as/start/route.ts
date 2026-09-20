import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { startViewAsSchema } from "@/lib/server/rbac/view-as-schemas";
import { startViewAs } from "@/lib/server/rbac/view-as";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/control/view-as/start — begin a read-only preview (Sprint 1 /
 * Phase 2B, CITY_MANAGER only — see canStartViewAs). Sets a separate,
 * short-lived, signed cookie (metro_view_as); the real session/identity is
 * never touched. Audits VIEW_AS_STARTED.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().check(`view_as.start:${user.id}`, { max: 20, windowMs: 60_000 });
    if (!rl.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });

    const input = startViewAsSchema.parse(await readJson(req));
    const ctx = await startViewAs(user, input);
    return jsonOk({ viewContext: ctx });
  } catch (e) {
    return handleError(e);
  }
}
