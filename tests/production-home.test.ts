import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSalesScore,
  computeFinalScore,
  round1,
  SALES_CAP,
  isRankingPosition,
} from "../src/lib/server/rating-formula";
import { taskMode, templatesForPosition, DAILY_TEMPLATES } from "../src/lib/server/daily-plan-catalog";
import { ACHIEVEMENT_CATALOG, ACHIEVEMENT_BY_CODE } from "../src/lib/server/achievements-catalog";
import { appDay, isAppToday } from "../src/lib/server/time";

/**
 * Production Home / Rating foundation. Pure logic is unit-tested; DB-bound
 * scenarios (A–U) are explicit integration skips (require Postgres), mirroring
 * the existing test suites.
 */

/* --------------------------- rating formula (§13) ------------------------ */

test("rating: salesScore = fact/plan*100, capped at 120", () => {
  assert.equal(round1(computeSalesScore(100, 100) ?? 0), 100);
  assert.equal(round1(computeSalesScore(100, 110) ?? 0), 110);
  assert.equal(computeSalesScore(100, 500), SALES_CAP); // capped
  assert.equal(round1(computeSalesScore(3, 1) ?? 0), 33.3);
});

test("rating: plan <= 0 → cannot compute (null)", () => {
  assert.equal(computeSalesScore(0, 50), null);
  assert.equal(computeSalesScore(-10, 50), null);
});

test("rating: finalScore = sales*0.7 + mystery*0.3", () => {
  assert.equal(round1(computeFinalScore(100, 90)), 97);
  assert.equal(round1(computeFinalScore(120, 100)), 114);
});

/* ------------------ O / §16 — ranking positions (real users) ------------- */

test("O: only CLIENT_MANAGER + NIGHT_MANAGER rank; ADMINISTRATOR excluded", () => {
  assert.equal(isRankingPosition("CLIENT_MANAGER"), true);
  assert.equal(isRankingPosition("NIGHT_MANAGER"), true);
  assert.equal(isRankingPosition("ADMINISTRATOR"), false);
  assert.equal(isRankingPosition(null), false);
});

/* ------------------ G — automatic task cannot be forged ------------------ */

test("G: task completion policy (LEARNING auto, SALES blocked, else manual)", () => {
  assert.equal(taskMode("LEARNING"), "auto"); // server-only completion
  assert.equal(taskMode("SALES"), "blocked"); // pending sales subsystem
  assert.equal(taskMode("CLIENTS"), "manual");
  assert.equal(taskMode("SHIFT"), "manual");
  assert.equal(taskMode("SERVICE"), "manual");
});

/* ----------------- §5 / §8 — plan composition by position ---------------- */

test("plan: CLIENT_MANAGER gets the full 5-task plan", () => {
  const t = templatesForPosition("CLIENT_MANAGER");
  assert.equal(t.length, 5);
  const cats = t.map((x) => x.category);
  assert.ok(cats.includes("LEARNING"));
  assert.ok(cats.includes("SALES"));
  assert.ok(cats.includes("CLIENTS"));
  assert.ok(cats.filter((c) => c === "SHIFT").length >= 2);
});

test("plan: NIGHT_MANAGER / ADMINISTRATOR fall back to the general minimal plan", () => {
  const night = templatesForPosition("NIGHT_MANAGER");
  const admin = templatesForPosition("ADMINISTRATOR");
  assert.equal(night.length, 3);
  assert.deepEqual(night, admin); // same general set
  assert.ok(night.some((t) => t.category === "LEARNING"));
  assert.ok(night.every((t) => t.position === null));
});

test("plan: template codes are unique", () => {
  const codes = DAILY_TEMPLATES.map((t) => t.code);
  assert.equal(new Set(codes).size, codes.length);
});

/* --------------------- §17/§18 — achievement catalog --------------------- */

test("achievements: production catalog defined (no mock), FIRST_LESSON + PERFECT_QUIZ present", () => {
  assert.ok(ACHIEVEMENT_CATALOG.length >= 16);
  assert.ok(ACHIEVEMENT_BY_CODE.has("FIRST_LESSON"));
  assert.ok(ACHIEVEMENT_BY_CODE.has("PERFECT_QUIZ"));
  assert.ok(ACHIEVEMENT_BY_CODE.has("TOP_3"));
  assert.ok(ACHIEVEMENT_BY_CODE.has("MYSTERY_100"));
  assert.ok(ACHIEVEMENT_BY_CODE.has("PLAN_STREAK_3"));
  const codes = ACHIEVEMENT_CATALOG.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length); // unique
});

/* ----------------------- timezone abstraction (§7) ----------------------- */

test("time: appDay is the app-timezone day at UTC midnight; rolls at local midnight", () => {
  // 2026-08-10 09:00 UTC = 12:00 Europe/Moscow → day 2026-08-10
  const d1 = appDay(new Date("2026-08-10T09:00:00Z"));
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 7); // August (0-based)
  assert.equal(d1.getUTCDate(), 10);
  // 2026-08-10 22:30 UTC = 01:30 next day in Moscow → day 2026-08-11
  const d2 = appDay(new Date("2026-08-10T22:30:00Z"));
  assert.equal(d2.getUTCDate(), 11);
});

test("time: isAppToday", () => {
  const now = new Date("2026-08-10T09:00:00Z");
  assert.equal(isAppToday(new Date("2026-08-10T20:00:00Z"), now), true);
  assert.equal(isAppToday(new Date("2026-08-09T09:00:00Z"), now), false);
});

/* ------------------ integration scenarios (require Postgres) ------------- */

const skip = { skip: "integration: requires Postgres + generated client" } as const;
test("A: Home XP = SUM of real XPTransaction", skip, () => {});
test("B: XP empty / today-empty renders honest state", skip, () => {});
test("C: daily plan generated once per day", skip, () => {});
test("D: repeated GET /plan/today creates no duplicate system tasks", skip, () => {});
test("E: LEARNING task auto-completes after LessonProgress", skip, () => {});
test("F: manual task can be completed", skip, () => {});
test("H: no MysteryShopperResult → honest empty state", skip, () => {});
test("I: PUBLISHED mystery result → visible", skip, () => {});
test("J: DRAFT mystery result → invisible", skip, () => {});
test("K: no rating → rating empty state", skip, () => {});
test("L: real PUBLISHED rating → Top-10", skip, () => {});
test("M: user outside Top-10 → personal row", skip, () => {});
test("N: user inside Top-10 → no duplicate row", skip, () => {});
test("P: FIRST_LESSON awarded once", skip, () => {});
test("Q: PERFECT_QUIZ awarded once", skip, () => {});
test("R: news mock absent from Home", skip, () => {});
test("S: achievement mock absent from Home", skip, () => {});
test("T: CLUB_MANAGER cannot write rating/mystery", skip, () => {});
test("U: EMPLOYEE cannot write rating/mystery", skip, () => {});
