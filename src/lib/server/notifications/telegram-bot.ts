import "server-only";
import { getServerEnv } from "../env";
import { runWithTimeout, TimeoutError } from "@/lib/async-timeout";
import { classifyTelegramHttpStatus } from "./notification-core";

/**
 * METRO UP ROUND 1, Milestone 4 — the ONE place that ever calls Telegram's
 * Bot API to SEND a message (distinct from telegram-auth.ts/telegram-
 * login.ts, which only VERIFY inbound initData/login-widget signatures —
 * confirmed by audit that no outbound bot messaging existed anywhere in
 * this codebase before this file). Server-side only, never the Telegram
 * WebApp client SDK (section 5's explicit requirement).
 *
 * SECURITY (section 14) — the bot token lives ONLY in the request URL this
 * function builds; it is never returned, logged, or included in any thrown
 * error. Every failure path below returns a small, fixed, safe code string
 * — never the caught error object, never the Telegram response body, never
 * the request URL.
 */

export type TelegramSendResult = { status: "SENT" } | { status: "FAILED" | "SKIPPED"; code: string };

const SEND_TIMEOUT_MS = 8_000;

/** Reuses the existing, generic, DOM-free timeout utility
 * (src/lib/async-timeout.ts — already used client-side for the Telegram
 * WebApp bootstrap; has no browser-only dependency, so it is equally valid
 * server-side) rather than hand-rolling a second one. */
export function buildMiniAppUrl(path: string): string | undefined {
  const base = getServerEnv().NEXT_PUBLIC_APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/+$/, "")}${path}`;
}

/**
 * Section 7 — every failure mode (missing/invalid config, timeout, blocked
 * bot, non-2xx response, network error) is caught HERE and turned into a
 * safe `{status, code}` result; this function NEVER throws. A single
 * attempt, no retry loop (section 7's explicit "do not implement infinite
 * retries" — the caller records the outcome for a future retry worker).
 */
export async function sendTelegramMessage(chatId: string, text: string, webAppUrl?: string): Promise<TelegramSendResult> {
  try {
    const token = getServerEnv().TELEGRAM_BOT_TOKEN;
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (webAppUrl) {
      body.reply_markup = { inline_keyboard: [[{ text: "Открыть в Metro UP", web_app: { url: webAppUrl } }]] };
    }

    const res = await runWithTimeout(
      (signal) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        }),
      SEND_TIMEOUT_MS,
    );

    if (!res.ok) {
      return { status: "FAILED", code: classifyTelegramHttpStatus(res.status) };
    }
    return { status: "SENT" };
  } catch (err) {
    if (err instanceof TimeoutError) return { status: "FAILED", code: "timeout" };
    // getServerEnv() throws a redacted "Invalid server environment: <keys>"
    // Error (never values) when TELEGRAM_BOT_TOKEN/etc are missing — this
    // branch is the "bot token missing" scenario section 7/17-F describes.
    if (err instanceof Error && err.message.startsWith("Invalid server environment")) {
      return { status: "FAILED", code: "config_error" };
    }
    return { status: "FAILED", code: "network_error" };
  }
}
