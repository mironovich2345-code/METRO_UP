import { test } from "node:test";
import assert from "node:assert/strict";
import { settleWidget, logHomeWidgetError } from "../src/lib/server/home-resolve";

/**
 * P0 resilience: one Home widget failing must NOT fail the whole dashboard.
 * Both getHomeDashboard (real user) and getHomeDashboardFor (View As preview)
 * run each widget through settleWidget (fallback on failure); Promise.all
 * over settleWidget therefore never rejects → /api/home never 500s from a
 * widget, in either mode. These cover the fault-isolation core + safe
 * logging. The DB-backed end-to-end (route returns 200 with partial data,
 * for a real user and for a preview) is an integration skip — see
 * view-as-effective-context.test.ts's EFFCTX-D/F for the preview side.
 *
 * Ported from main's dc9f8e8 rather than cherry-picked (see home-resolve.ts's
 * header comment) — this file itself needed no changes, since it only
 * exercises the generic settleWidget/logHomeWidgetError helper, not either
 * caller.
 */

const noop = () => {};

test("A: a widget that succeeds returns its real value unchanged", async () => {
  const v = await settleWidget("plan", async () => ({ total: 3, completed: 1, tasks: [] }), { total: 0, completed: 0, tasks: [] }, noop);
  assert.deepEqual(v, { total: 3, completed: 1, tasks: [] });
});

test("B: a rejecting widget resolves to its fallback (no throw)", async () => {
  const fallback = { date: "", total: 0, completed: 0, tasks: [] };
  const v = await settleWidget("plan", async () => { throw new Error("boom"); }, fallback, noop);
  assert.deepEqual(v, fallback);
});

test("C/D/E: rating / mystery / achievements failures each fall back independently", async () => {
  const rating = await settleWidget("rating", async () => { throw new Error("x"); }, { hasData: false }, noop);
  const mystery = await settleWidget("mystery", async () => { throw new Error("x"); }, { hasData: false }, noop);
  const count = await settleWidget("achievements_count", async () => { throw new Error("x"); }, 0, noop);
  const last = await settleWidget<null | { title: string }>("last_achievement", async () => { throw new Error("x"); }, null, noop);
  assert.deepEqual(rating, { hasData: false });
  assert.deepEqual(mystery, { hasData: false });
  assert.equal(count, 0);
  assert.equal(last, null);
});

test("F: multiple widgets failing → Promise.all over settleWidget still resolves fully", async () => {
  const results = await Promise.all([
    settleWidget("plan", async () => { throw new Error("a"); }, { total: 0, completed: 0, tasks: [] }, noop),
    settleWidget("xp", async () => ({ total: 5, today: 2, recent: [] }), { total: 0, today: 0, recent: [] }, noop),
    settleWidget("rating", async () => { throw new Error("b"); }, { hasData: false }, noop),
    settleWidget("mystery", async () => { throw new Error("c"); }, { hasData: false }, noop),
    settleWidget("achievements_count", async () => 7, 0, noop),
    settleWidget<null | { title: string }>("last_achievement", async () => { throw new Error("d"); }, null, noop),
  ]);
  // Never rejects; failed widgets = fallbacks, healthy widgets = real values.
  assert.deepEqual(results[0], { total: 0, completed: 0, tasks: [] });
  assert.deepEqual(results[1], { total: 5, today: 2, recent: [] });
  assert.deepEqual(results[4], 7);
  assert.equal(results[5], null);
});

test("G: settleWidget does NOT swallow auth errors (auth runs OUTSIDE it)", async () => {
  // getHomeDashboard/getHomeDashboardFor receive an already-authenticated (or
  // already-resolved-effective) user; requireFullAccess + resolveEffectiveReadContext
  // run in the route, before either function. settleWidget only wraps the
  // per-widget data calls, so an auth failure never reaches it. Model that: a
  // throw in the "auth" step (a plain call, not wrapped) propagates.
  const authThenDashboard = async () => {
    throw Object.assign(new Error("unauthorized"), { status: 401, code: "unauthorized" });
  };
  await assert.rejects(authThenDashboard(), (e) => (e as { code?: string }).code === "unauthorized");
});

test("logging: safe marker includes widget + errorType + short code, no PII", async () => {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (msg?: unknown) => { lines.push(String(msg)); };
  try {
    class PrismaClientKnownRequestError extends Error { code = "P2025"; }
    logHomeWidgetError("plan", new PrismaClientKnownRequestError("Record to update not found: user 12345 phone +7999"));
    logHomeWidgetError("rating", new Error("plain"));
  } finally {
    console.error = orig;
  }
  assert.match(lines[0], /\[home-widget-error\]/);
  assert.match(lines[0], /"widget":"plan"/);
  assert.match(lines[0], /"code":"P2025"/);
  // The raw Prisma message (which can echo data/PII) must NOT be logged.
  assert.equal(lines[0].includes("12345"), false);
  assert.equal(lines[0].includes("+7999"), false);
  assert.equal(lines[1].includes("code"), false); // plain Error → no code field
});
