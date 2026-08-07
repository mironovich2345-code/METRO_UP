import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyTelegramInitData } from "../src/lib/server/telegram-auth";
import { onboardingSchema } from "../src/lib/server/schemas";
import {
  signSessionToken,
  verifySessionToken,
  buildSessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "../src/lib/server/session-token";
import { isClubInCity, getClubById } from "../src/content/cities";
import { resolveProfileSource } from "../src/lib/api/profile-source";
import type { AppUserDTO } from "../src/lib/api/types";

/**
 * Security/behaviour matrix A–L. No real Telegram credentials, no production
 * secrets. Unit-testable scenarios run here; DB-integration scenarios (D, E, L)
 * are explicit skips that require a live Postgres (run against Railway).
 */

const TOKEN = "123456:FAKE_TEST_TOKEN";
const now = () => Math.floor(Date.now() / 1000);

/** Build a signed initData string exactly like Telegram does (independent fixture). */
function buildInitData(opts: {
  authDate: number;
  user: Record<string, unknown>;
  token?: string;
  reverse?: boolean;
}): string {
  const entries: [string, string][] = [
    ["auth_date", String(opts.authDate)],
    ["query_id", "AAExampleQueryId"],
    ["user", JSON.stringify(opts.user)],
  ];
  if (opts.reverse) entries.reverse();
  const params = new URLSearchParams(entries);
  // data_check_string: sorted "key=value", hash excluded.
  const dcs = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(opts.token ?? TOKEN)
    .digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dcs).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

/* ----------------------- A / B / C — Telegram auth ----------------------- */

test("A: valid initData → success", () => {
  const initData = buildInitData({
    authDate: now(),
    user: { id: 777, first_name: "Даниил", last_name: "Миронович" },
  });
  const res = verifyTelegramInitData(initData, TOKEN);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.user.id, 777);
});

test("B: invalid hash → rejected (→ 401)", () => {
  const initData = buildInitData({ authDate: now(), user: { id: 1 } });
  const tampered = initData.replace(/hash=([a-f0-9]+)/, (_m, h) =>
    "hash=" + h.slice(0, -1) + (h.endsWith("0") ? "1" : "0"),
  );
  assert.equal(verifyTelegramInitData(tampered, TOKEN).ok, false);
});

test("B2: wrong bot token → rejected", () => {
  const initData = buildInitData({ authDate: now(), user: { id: 1 } });
  assert.equal(verifyTelegramInitData(initData, "999:OTHER").ok, false);
});

test("C: expired auth_date → rejected (→ 401)", () => {
  const initData = buildInitData({ authDate: now() - 90_000, user: { id: 1 } });
  const res = verifyTelegramInitData(initData, TOKEN, 86_400);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "expired");
});

/* -------------------- Item 3 — crypto sub-verification -------------------- */

test("crypto: field order does not matter (sorted data_check_string)", () => {
  const a = buildInitData({ authDate: now(), user: { id: 5 }, reverse: false });
  const b = buildInitData({ authDate: now(), user: { id: 5 }, reverse: true });
  assert.equal(verifyTelegramInitData(a, TOKEN).ok, true);
  assert.equal(verifyTelegramInitData(b, TOKEN).ok, true);
});

test("crypto: auth_date TTL boundary", () => {
  const fresh = buildInitData({ authDate: now() - 10, user: { id: 1 } });
  assert.equal(verifyTelegramInitData(fresh, TOKEN, 60).ok, true);
  const stale = buildInitData({ authDate: now() - 120, user: { id: 1 } });
  assert.equal(verifyTelegramInitData(stale, TOKEN, 60).ok, false);
});

test("crypto: missing hash rejected", () => {
  assert.equal(verifyTelegramInitData("auth_date=1&user=%7B%7D", TOKEN).ok, false);
});

/* ------------------------- Item 4 — session cookie ----------------------- */

const SECRET = "test-secret-abcdefghijklmnop";

test("session: sign/verify round-trip", () => {
  const token = signSessionToken("user-123", SECRET);
  assert.equal(verifySessionToken(token, SECRET), "user-123");
});

test("session: tampered token → null", () => {
  const token = signSessionToken("user-123", SECRET);
  assert.equal(verifySessionToken(token.slice(0, -2) + "xx", SECRET), null);
  assert.equal(verifySessionToken(token, "another-secret-xxxxxxxx"), null);
});

test("session: expired token → null", () => {
  const past = now() - SESSION_MAX_AGE_SECONDS - 10;
  const token = signSessionToken("u", SECRET, past);
  assert.equal(verifySessionToken(token, SECRET), null);
});

test("session: cookie flags (HttpOnly, Secure in prod, SameSite, Max-Age)", () => {
  const prod = buildSessionCookieOptions(true);
  assert.equal(prod.httpOnly, true);
  assert.equal(prod.secure, true);
  assert.equal(prod.sameSite, "lax");
  assert.equal(prod.path, "/");
  assert.ok(prod.maxAge > 0 && prod.maxAge <= 60 * 60 * 24 * 31);
  assert.equal(buildSessionCookieOptions(false).secure, false);
});

/* ------------------------- F / G / H — onboarding ------------------------ */

test("F: valid city/club/position → success", () => {
  const r = onboardingSchema.safeParse({
    displayName: "Даниил",
    cityId: "yekaterinburg",
    clubId: "yekaterinburg-amundsena-63",
    positionId: "CLIENT_MANAGER",
  });
  assert.equal(r.success, true);
  assert.equal(isClubInCity("yekaterinburg", "yekaterinburg-amundsena-63"), true);
});

test("G: club of another city → rejected (→ 400)", () => {
  assert.equal(
    isClubInCity("yekaterinburg", "novosibirsk-karla-marksa-47-2"),
    false,
  );
});

test("H: unknown club → rejected (→ 400)", () => {
  assert.equal(getClubById("no-such-club"), undefined);
});

test("I: privileged fields stripped (FULL/role/careerLevel not accepted)", () => {
  const r = onboardingSchema.parse({
    displayName: "Даниил",
    cityId: "yekaterinburg",
    clubId: "yekaterinburg-amundsena-63",
    positionId: "ADMINISTRATOR",
    accessStatus: "FULL",
    role: "ADMIN",
    careerLevel: "MANAGER_PRO",
    onboardingCompleted: true,
  } as Record<string, unknown>);
  assert.equal("accessStatus" in r, false);
  assert.equal("role" in r, false);
  assert.equal("careerLevel" in r, false);
  assert.equal("onboardingCompleted" in r, false);
});

test("onboarding: unknown position rejected", () => {
  const r = onboardingSchema.safeParse({
    displayName: "Даниил",
    cityId: "yekaterinburg",
    clubId: "yekaterinburg-amundsena-63",
    positionId: "CEO",
  });
  assert.equal(r.success, false);
});

/* --------------------------- J — server priority ------------------------- */

test("J: server profile overrides localStorage", () => {
  const serverUser: AppUserDTO = {
    displayName: "Даниил",
    role: "EMPLOYEE",
    telegram: { username: null, firstName: null, lastName: null, photoUrl: null },
    onboardingCompleted: true,
    profile: {
      cityId: "yekaterinburg",
      clubId: "yekaterinburg-amundsena-63",
      positionId: "CLIENT_MANAGER",
      careerLevel: "NEWCOMER",
      accessStatus: "LIMITED",
    },
  };
  assert.equal(resolveProfileSource(serverUser, true), "server");
  assert.equal(resolveProfileSource(null, true), "local");
  assert.equal(resolveProfileSource(null, false), "none");
});

/* ------------------------ K — unauthenticated → 401 ---------------------- */

test("K: no session token → unauthenticated (→ 401)", () => {
  // requireUser() derives identity from this; no/invalid cookie => null => 401.
  assert.equal(verifySessionToken(undefined, SECRET), null);
  assert.equal(verifySessionToken("garbage", SECRET), null);
});

/* --------------- D / E / L — integration (require Postgres) --------------- */

test(
  "D: existing telegramId → same User (no duplicate)",
  { skip: "integration: requires Postgres + generated client" },
  () => {},
);
test(
  "E: new telegramId → new User",
  { skip: "integration: requires Postgres + generated client" },
  () => {},
);
test(
  "L: database unavailable → /api/health = 503",
  { skip: "integration: requires Postgres + running server" },
  () => {},
);
