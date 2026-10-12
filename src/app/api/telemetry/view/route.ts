import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/authz";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { getRateLimiter } from "@/lib/server/rate-limit";
import { recordPageView } from "@/lib/server/telemetry/page-views";
import { isScreenKey } from "@/lib/telemetry/screens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous for real navigation, cheap protection against a scripted flood. */
const PAGE_VIEW_RATE_MAX = 120;
const PAGE_VIEW_RATE_WINDOW_MS = 60_000;

/** Exactly one field; any other key (userId, url, metadata, …) is rejected. */
const bodySchema = z.object({ screen: z.string().max(64) }).strict();

/**
 * POST /api/telemetry/view — Sprint: LIVE QA QA-07. Records ONE committed
 * screen visit. Authenticated users only; the user is the REAL session user
 * (requireUser — a View-As preview never substitutes it, and the body cannot
 * name a user). `screen` must be a registry key (src/lib/telemetry/screens.ts);
 * the surface is derived from it server-side. No URL, query or id is stored.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const rate = await getRateLimiter().check(`telemetry.view:${user.id}`, { max: PAGE_VIEW_RATE_MAX, windowMs: PAGE_VIEW_RATE_WINDOW_MS });
    if (!rate.allowed) return jsonError(429, "rate_limited", { retryAfterSeconds: rate.retryAfterSeconds });
    const body = bodySchema.parse(await readJson(req));
    if (!isScreenKey(body.screen)) return jsonError(400, "unknown_screen");
    await recordPageView(user.id, body.screen);
    return jsonOk({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
