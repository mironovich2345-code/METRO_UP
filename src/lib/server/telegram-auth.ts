import crypto from "node:crypto";

/**
 * Server-side verification of Telegram Mini App `initData`.
 *
 * `initDataUnsafe` from the client is NOT proof of identity. The client sends
 * raw `initData`; we verify its HMAC signature with the bot token (server-only)
 * per the Telegram Mini Apps authentication algorithm, check freshness, and only
 * then trust the embedded user. The bot token never reaches the client bundle.
 */

export interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export type TelegramVerifyResult =
  | { ok: true; user: TelegramAuthUser; authDate: number }
  | { ok: false; reason: "missing_hash" | "missing_user" | "bad_hash" | "expired" | "malformed" };

function hmacSha256(key: crypto.BinaryLike, data: crypto.BinaryLike): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verify `initData`. `maxAgeSeconds` rejects stale auth (default 24h).
 * Never logs the raw initData.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86_400,
): TelegramVerifyResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing_hash" };
  params.delete("hash");

  // data_check_string: "key=value" pairs sorted by key, joined by "\n".
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  const secretKey = hmacSha256("WebAppData", botToken);
  const computedHash = hmacSha256(secretKey, dataCheckString).toString("hex");

  if (!timingSafeHexEqual(computedHash, hash)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, reason: "expired" };
  }
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, reason: "missing_user" };
  try {
    const user = JSON.parse(userRaw) as TelegramAuthUser;
    if (typeof user.id !== "number") return { ok: false, reason: "malformed" };
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
