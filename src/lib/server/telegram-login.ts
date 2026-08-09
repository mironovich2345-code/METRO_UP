import crypto from "node:crypto";

/**
 * Verify a Telegram Login Widget payload (desktop web sign-in). This is distinct
 * from Mini App initData: the secret key is SHA256(bot_token) and the payload is
 * a flat field set. Reuses the same Telegram identity — no passwords.
 * Docs: https://core.telegram.org/widgets/login#checking-authorization
 */
export interface TelegramLoginUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export type TelegramLoginResult =
  | { ok: true; user: TelegramLoginUser }
  | { ok: false; reason: "hash" | "expired" | "malformed" };

export function verifyTelegramLoginWidget(
  params: Record<string, unknown>,
  botToken: string,
  maxAgeSeconds = 86_400,
): TelegramLoginResult {
  const hash = params.hash;
  if (typeof hash !== "string" || !hash) return { ok: false, reason: "malformed" };

  const entries = Object.entries(params)
    .filter(([k, v]) => k !== "hash" && v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as [string, string]);

  const dataCheckString = entries
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "hash" };

  const authDate = Number(params.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: "malformed" };
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) return { ok: false, reason: "expired" };

  const id = Number(params.id);
  if (!Number.isFinite(id)) return { ok: false, reason: "malformed" };

  return {
    ok: true,
    user: {
      id,
      first_name: typeof params.first_name === "string" ? params.first_name : undefined,
      last_name: typeof params.last_name === "string" ? params.last_name : undefined,
      username: typeof params.username === "string" ? params.username : undefined,
      photo_url: typeof params.photo_url === "string" ? params.photo_url : undefined,
    },
  };
}
