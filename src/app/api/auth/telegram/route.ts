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

/** POST /api/auth/telegram — verify raw initData, upsert user, open session. */
export async function POST(req: NextRequest) {
  const startedAt = performance.now();
  try {
    logAuth("start", startedAt);
    const rl = await getRateLimiter().check("auth:telegram");
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
    logAuth("initdata_verified", startedAt);

    const telegramId = String(tgUser.id);
    const fullName =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ").trim() ||
      tgUser.first_name ||
      "Сотрудник";

    logAuth("user_lookup", startedAt);
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

    const res = jsonOk({ user: meDTO(user) });
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken(user.id),
      sessionCookieOptions(),
    );
    logAuth("done", startedAt);
    return res;
  } catch (error) {
    logAuth("error", startedAt);
    return handleError(error);
  }
}
