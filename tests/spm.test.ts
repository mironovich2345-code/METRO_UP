import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  computeSalesScore,
  computeFinalScore,
  round1,
  SALES_CAP,
  compareRankRows,
  isRankingPosition,
  type RankRow,
} from "../src/lib/server/rating-formula";
import { salesUpsertSchema, mysteryUpsertSchema } from "../src/lib/server/spm-schemas";
import { verifyTelegramLoginWidget } from "../src/lib/server/telegram-login";

/**
 * SPM rating control panel. Pure logic + security-schema unit tests; DB/HTTP
 * scenarios (A–Z) are integration skips (require Postgres + a running server).
 */

/* --------------------------- N / O — formula ---------------------------- */

test("N: finalScore = sales*0.7 + mystery*0.3", () => {
  assert.equal(round1(computeFinalScore(110, 92)), 104.6);
});

test("O: sales cap 120; plan<=0 → null", () => {
  assert.equal(round1(computeSalesScore(500000, 550000) ?? 0), 110);
  assert.equal(computeSalesScore(500000, 700000), SALES_CAP); // capped 120
  assert.equal(computeSalesScore(0, 100), null);
});

/* --------------------- P — deterministic tie-breaker -------------------- */

test("P: ties broken by mystery, then sales, then createdAt, then id", () => {
  const rows: RankRow[] = [
    { userId: "b", finalScore: 100, mysteryScore: 90, salesScore: 105, createdAt: 200 },
    { userId: "a", finalScore: 100, mysteryScore: 95, salesScore: 100, createdAt: 100 }, // higher mystery → first
    { userId: "c", finalScore: 100, mysteryScore: 90, salesScore: 105, createdAt: 100 }, // same as b but earlier createdAt
    { userId: "d", finalScore: 90, mysteryScore: 99, salesScore: 99, createdAt: 50 }, // lower final → last
  ];
  const order = [...rows].sort(compareRankRows).map((r) => r.userId);
  assert.deepEqual(order, ["a", "c", "b", "d"]);
  // Deterministic: same input → same output.
  const order2 = [...rows].sort(compareRankRows).map((r) => r.userId);
  assert.deepEqual(order, order2);
});

/* --------------- G / H — salesScore is never client-provided ------------ */

test("H: SPM cannot submit salesScore (schema strips it; score is server-derived)", () => {
  const parsed = salesUpsertSchema.parse({
    employeeUserId: "00000000-0000-0000-0000-000000000001",
    month: 7, year: 2026, personalPlan: 500000, personalFact: 550000,
    salesScore: 999, // attempted injection
  } as Record<string, unknown>);
  assert.equal("salesScore" in parsed, false);
});

/* --------------------- I — mystery score validation --------------------- */

test("I: mystery score >100 or <0 rejected", () => {
  const base = { employeeUserId: "00000000-0000-0000-0000-000000000001", month: 7, year: 2026 };
  assert.equal(mysteryUpsertSchema.safeParse({ ...base, score: 101 }).success, false);
  assert.equal(mysteryUpsertSchema.safeParse({ ...base, score: -1 }).success, false);
  assert.equal(mysteryUpsertSchema.safeParse({ ...base, score: 100 }).success, true);
});

/* ------------------------ U — ranking positions ------------------------- */

test("U: only CLIENT_MANAGER + NIGHT_MANAGER rank (real users)", () => {
  assert.equal(isRankingPosition("CLIENT_MANAGER"), true);
  assert.equal(isRankingPosition("NIGHT_MANAGER"), true);
  assert.equal(isRankingPosition("ADMINISTRATOR"), false);
});

/* ----------------- web auth — Telegram Login Widget verify -------------- */

function signLogin(params: Record<string, unknown>, token: string) {
  const dcs = Object.entries(params)
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  return crypto.createHmac("sha256", secret).update(dcs).digest("hex");
}

test("web auth: valid Login Widget payload verifies; tampered/expired rejected", () => {
  const token = "123456:TEST_BOT_TOKEN";
  const now = Math.floor(Date.now() / 1000);
  const base = { id: 42, first_name: "SPM", username: "spm_user", auth_date: now };
  const hash = signLogin(base, token);

  const ok = verifyTelegramLoginWidget({ ...base, hash }, token);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.user.id, 42);

  // Wrong token → hash mismatch.
  assert.equal(verifyTelegramLoginWidget({ ...base, hash }, "999:OTHER").ok, false);
  // Tampered field.
  assert.equal(verifyTelegramLoginWidget({ ...base, id: 43, hash }, token).ok, false);
  // Expired.
  const old = { id: 42, first_name: "SPM", auth_date: now - 200_000 };
  const r = verifyTelegramLoginWidget({ ...old, hash: signLogin(old, token) }, token, 86_400);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "expired");
});

/* ---------------- integration scenarios (require Postgres) -------------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("A: EMPLOYEE GET /spm denied", skip, () => {});
test("B: CLUB_MANAGER GET /spm denied", skip, () => {});
test("C: SPM allowed", skip, () => {});
test("D: EMPLOYEE write sales → 403", skip, () => {});
test("E: CLUB_MANAGER write → 403", skip, () => {});
test("F: SPM sales save success", skip, () => {});
test("G: score calculated server-side (persisted)", skip, () => {});
test("J: DRAFT mystery invisible to employee", skip, () => {});
test("K: PUBLISHED mystery visible", skip, () => {});
test("L: calculate requires ready data", skip, () => {});
test("M: excluded employee doesn't block readiness", skip, () => {});
test("Q: publish only READY period", skip, () => {});
test("R: employee cannot publish", skip, () => {});
test("S: published period visible to /ranking", skip, () => {});
test("T: draft period invisible to /ranking", skip, () => {});
test("V: current employee outside Top-10 gets own row", skip, () => {});
test("W: no duplicate own row when in Top-10", skip, () => {});
test("X: audit created for writes", skip, () => {});
test("Y: double publish protected (idempotent)", skip, () => {});
test("Z: achievements awarded idempotently", skip, () => {});
