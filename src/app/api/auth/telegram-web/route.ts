import type { NextRequest } from "next/server";
import { prisma } from "@/lib/server/db";
import { verifyTelegramLoginWidget } from "@/lib/server/telegram-login";
import { getServerEnv } from "@/lib/server/env";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/session";
import { jsonOk, jsonError, handleError, readJson } from "@/lib/server/http";
import { meDTO } from "@/lib/server/dto";
import { getRateLimiter } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/telegram-web — desktop web sign-in via the Telegram Login
 * Widget. Verifies the widget hash server-side, upserts the user, and opens the
 * same HttpOnly session used everywhere. Does NOT grant any role — SPM/ADMIN are
 * assigned in the DB by an admin. Role is enforced by requireSPM/requireAdmin.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await getRateLimiter().check("auth:telegram-web");
    if (!rl.allowed) return jsonError(429, "rate_limited");

    const params = (await readJson(req)) as Record<string, unknown>;
    const result = verifyTelegramLoginWidget(params, getServerEnv().TELEGRAM_BOT_TOKEN);
    if (!result.ok) return jsonError(401, "invalid_login");

    const tg = result.user;
    const telegramId = String(tg.id);
    const fullName =
      [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() || tg.first_name || "Сотрудник";

    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        telegramUsername: tg.username ?? null,
        telegramFirstName: tg.first_name ?? null,
        telegramLastName: tg.last_name ?? null,
        telegramPhotoUrl: tg.photo_url ?? null,
        lastLoginAt: new Date(),
      },
      create: {
        telegramId,
        telegramUsername: tg.username ?? null,
        telegramFirstName: tg.first_name ?? null,
        telegramLastName: tg.last_name ?? null,
        telegramPhotoUrl: tg.photo_url ?? null,
        displayName: fullName,
        role: "EMPLOYEE",
        lastLoginAt: new Date(),
      },
      include: { employeeProfile: true },
    });

    const res = jsonOk({ user: meDTO(user) });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
    return res;
  } catch (error) {
    return handleError(error);
  }
}
