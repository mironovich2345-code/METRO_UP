import type { NextRequest } from "next/server";
import { sanitizeBootstrapDiag } from "@/lib/bootstrap-diag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/diag/bootstrap — temporary client bootstrap telemetry sink.
 * Logs ONLY the whitelisted, non-PII fields (sanitizeBootstrapDiag drops anything
 * else — initData/telegramId/token/name/etc. can never be logged). No DB writes,
 * no auth needed (fire-and-forget beacon). Always 204 so it never blocks a client.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => null);
    const safe = sanitizeBootstrapDiag(raw);
    if (safe) console.info(`[bootstrap-diag] ${JSON.stringify(safe)}`);
  } catch {
    /* diagnostics must never error */
  }
  return new Response(null, { status: 204 });
}
