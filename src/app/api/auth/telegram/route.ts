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
import { hasTelegramMetadataChanged } from "@/lib/server/telegram-identity";
import { hasSystemAccessForUser } from "@/lib/server/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe auth diagnostics — phase + elapsed only. No initData/token/telegramId/PII. */
function logAuth(phase: string, startedAt: number) {
  console.info(`[auth-telegram] ${JSON.stringify({ phase, durationMs: Math.round(performance.now() - startedAt) })}`);
}

/**
 * Sprint: mini-app-cold-start / mini-app-server-startup — one consolidated
 * PERF_LOG=1-only breakdown line per request (easier to read one row of
 * fields off a Railway log than reconstruct deltas from several separate
 * lines for a route this short/linear). No PII/initData/token — route/phase
 * names and milliseconds only, exactly like every other perf.ts consumer.
 *
 * mini-app-server-startup's real Railway measurement (`userUpsertMs ≈
 * 690ms`) replaced the single always-write `user.upsert` with a
 * findUnique-first fast path (see POST below) — `userLookupMs`/`userWriteMs`/
 * `writePath` replace the old single `userUpsertMs` field so a Railway log
 * line shows directly whether a given request took the no-write fast path
 * ("none"), wrote changed metadata ("metadata-update"), or created a brand
 * new user ("create"). Still NO RoleAssignment/grant lookup at all
 * (meDTO(user) with no second argument never sets viewContext) — reported as
 * `n/a`, not fabricated as 0, so the absence reads as "doesn't exist" rather
 * than "measured and free."
 */
const PERF_LOG = process.env.PERF_LOG === "1";
function logAuthBreakdown(fields: Record<string, number | string>) {
  if (!PERF_LOG) return;
  console.info(`[perf-auth-telegram] ${JSON.stringify(fields)}`);
}

/** POST /api/auth/telegram — verify raw initData, resolve user (fast path for
 * an existing, unchanged account), open session. */
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

    /**
     * Sprint: mini-app-server-startup, section 1/2 — real Railway measurement
     * showed `userUpsertMs ≈ 690ms` for what is, on every reopen after the
     * first ever one, an EXISTING user whose Telegram metadata essentially
     * never changes. An `upsert` is a write either way (Postgres still does
     * an INSERT-attempt-then-UPDATE-on-conflict dance even when every
     * updated column's new value equals its old one) — a `findUnique` read
     * is the fast path; the write (and its lock/WAL cost) only happens when
     * there is something to actually persist.
     *
     * Fast path (the common case, every reopen): findUnique by the unique
     * telegramId index, including employeeProfile (same single round trip
     * shape as before — still exactly one query for a session that resolves
     * to "no write needed"). If every synced field is unchanged, skip the
     * write entirely; `lastLoginAt` is presence/analytics metadata with no
     * reader anywhere in authorization or business logic (verified by
     * search — effective-context.ts's only other reference sets it to null
     * for a synthetic View-As persona, never reads a real one) — it is
     * updated fire-and-forget, AFTER the response is already being written,
     * never awaited and never allowed to add latency to this request.
     *
     * Slow path (first-ever login, or a changed username/name/photo):
     * unchanged `upsert` — still the single safe, race-proof way to create a
     * new User under concurrent first-logins (retained exactly as before,
     * reached only when `findUnique` found nothing, or found stale metadata
     * that must be persisted now rather than deferred).
     */
    const lookupStart = performance.now();
    const existing = await prisma.user.findUnique({
      where: { telegramId },
      include: { employeeProfile: true },
    });
    const userLookupMs = Math.round(performance.now() - lookupStart);

    let user: NonNullable<typeof existing>;
    let userWriteMs = 0;
    let writePath: "none" | "metadata-update" | "create";

    if (existing) {
      const metadataChanged = hasTelegramMetadataChanged(existing, {
        telegramUsername: tgUser.username ?? null,
        telegramFirstName: tgUser.first_name ?? null,
        telegramLastName: tgUser.last_name ?? null,
        telegramPhotoUrl: tgUser.photo_url ?? null,
      });

      if (metadataChanged) {
        const writeStart = performance.now();
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            telegramUsername: tgUser.username ?? null,
            telegramFirstName: tgUser.first_name ?? null,
            telegramLastName: tgUser.last_name ?? null,
            telegramPhotoUrl: tgUser.photo_url ?? null,
            lastLoginAt: new Date(),
          },
          include: { employeeProfile: true },
        });
        userWriteMs = Math.round(performance.now() - writeStart);
        writePath = "metadata-update";
      } else {
        user = existing;
        writePath = "none";
        // Fire-and-forget — never awaited. runtime="nodejs" on a persistent
        // Railway container (not a frozen-after-response Edge/Lambda
        // isolate), so the event loop keeps running after `return res`
        // below and this still completes; a failure here is silently
        // swallowed on purpose (a missed lastLoginAt bump is never worth
        // logging noise, let alone failing auth over).
        void prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
      }
    } else {
      const writeStart = performance.now();
      user = await prisma.user.upsert({
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
      userWriteMs = Math.round(performance.now() - writeStart);
      writePath = "create";
    }

    // Sprint: REMEDIATION R3, F-06 — an EXISTING user signing back in may
    // already hold a real PROJECT_ADMIN grant; computed via the real
    // primitive, same as every other meDTO call site.
    const res = jsonOk({ user: meDTO(user, await hasSystemAccessForUser(user)) });
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
      userLookupMs,
      userWriteMs,
      writePath,
      roleGrantLookupMs: "n/a — this route never queries RoleAssignment (meDTO carries no viewContext here)",
    });
    return res;
  } catch (error) {
    logAuth("error", startedAt);
    logAuthBreakdown({ totalMs: Math.round(performance.now() - startedAt), phase: "error" });
    return handleError(error);
  }
}
