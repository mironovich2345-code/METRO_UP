import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { verifyTelegramInitData } from "@/lib/server/telegram-auth";
import { getServerEnv, isDemoAuthAllowed } from "@/lib/server/env";
import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/server/session";
import { telegramAuthSchema } from "@/lib/server/schemas";
import { jsonOk, jsonError, handleError } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";
import { getRateLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe auth diagnostics — phase + elapsed only. No initData/token/telegramId/PII. */
function logAuth(phase: string, startedAt: number) {
  console.info(`[auth-telegram] ${JSON.stringify({ phase, durationMs: Math.round(performance.now() - startedAt) })}`);
}

/**
 * Sprint: mini-app-cold-start, sections 2/3 — one consolidated PERF_LOG=1-only
 * breakdown line per request (easier to read one row of fields off a Railway
 * log than reconstruct deltas from several separate lines for a route this
 * short/linear). No PII/initData/token — route/phase names and milliseconds
 * only, exactly like every other perf.ts consumer.
 *
 * Section 3's audit finding, stated honestly rather than forced into the
 * brief's assumed field names: this route does ONE Prisma round trip total
 * (`user.upsert` with `include: employeeProfile` — already a single combined
 * query, not two sequential ones) and NO RoleAssignment/grant lookup at all
 * (meDTO(user) with no second argument never sets viewContext, so nothing
 * here ever queries grants). There is no separate "profileLookupMs" or
 * "roleGrantLookupMs" phase to report because that work genuinely does not
 * happen in this route — reported as `n/a`, not fabricated as 0, so the
 * absence reads as "doesn't exist" rather than "measured and free."
 */
const PERF_LOG = process.env.PERF_LOG === "1";
function logAuthBreakdown(fields: Record<string, number | string>) {
  if (!PERF_LOG) return;
  console.info(`[perf-auth-telegram] ${JSON.stringify(fields)}`);
}

/** POST /api/auth/telegram — verify raw initData, upsert user, open session. */
export async function POST(req: NextRequest) {
  const startedAt = performance.now();
  try {
    logAuth("start", startedAt);
    const rlStart = performance.now();
    const rl = await getRateLimiter().check("auth:telegram");
    const rateLimitMs = Math.round(performance.now() - rlStart);
    if (!rl.allowed) return jsonError(429, "rate_limited");

    const body = await req.json().catch(() => ({}));
    const { initData } = telegramAuthSchema.parse(body);

    const env = getServerEnv();

    let tgUser: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };

    const verifyStart = performance.now();
    if (initData === "demo" && isDemoAuthAllowed()) {
      // Dev/browser demo only — never reachable in production.
      tgUser = {
        id: 0,
        first_name: "Даниил",
        last_name: "Миронович",
        username: "metro_demo",
      };
    } else {
      const result = verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
      if (!result.ok) return jsonError(401, "invalid_init_data");
      tgUser = result.user;
    }
    const verifyInitDataMs = Math.round(performance.now() - verifyStart);
    logAuth("initdata_verified", startedAt);

    const telegramId = String(tgUser.id);
    const fullName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim() ||
      tgUser.first_name ||
      "Сотрудник";

    logAuth("user_lookup", startedAt);
    const upsertStart = performance.now();
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername: tgUser.username ?? null,
        telegramFirstName: tgUser.first_name ?? null,
        telegramLastName: tgUser.last_name ?? null,
        telegramPhotoUrl: tgUser.photo_url ?? null,
        lastLoginAt: new Date(),
      },
      create: {
        telegramId,
        telegramUsername: tgUser.username ?? null,
        telegramFirstName: tgUser.first_name ?? null,
        telegramLastName: tgUser.last_name ?? null,
        telegramPhotoUrl: tgUser.photo_url ?? null,
        displayName: fullName,
        role: "EMPLOYEE",
        lastLoginAt: new Date(),
      },
      include: { employeeProfile: true },
    });
    // This ONE query already covers what the brief called "userLookupMs" +
    // "profileLookupMs" — employeeProfile is a Prisma `include`, not a
    // second round trip. Reported under its real name, not split in two.
    const userUpsertMs = Math.round(performance.now() - upsertStart);

    const res = jsonOk({ user: meDTO(user) });
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user.id),
      sessionCookieOptions(),
    );
    logAuth("done", startedAt);
    logAuthBreakdown({
      totalMs: Math.round(performance.now() - startedAt),
      rateLimitMs,
      verifyInitDataMs,
      userUpsertMs,
      roleGrantLookupMs: "n/a — this route never queries RoleAssignment (meDTO carries no viewContext here)",
    });
    return res;
  } catch (error) {
    logAuth("error", startedAt);
    logAuthBreakdown({ totalMs: Math.round(performance.now() - startedAt), phase: "error" });
    return handleError(error);
  }
}
