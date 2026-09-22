import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { signViewAsToken, VIEW_AS_COOKIE } from "../src/lib/server/view-as-token";

/**
 * Sprint 1 / Phase 2C, Blocker #1 — global View As read-only guard. Unlike
 * most of this codebase's DB-backed scenarios, middleware.ts is DELIBERATELY
 * DB-free (see its own header comment), so every scenario below runs for
 * real — no Postgres, no running server, just the middleware function and a
 * constructed NextRequest, exactly what Next.js itself would build from a
 * real HTTP request.
 */

const SECRET = "test-secret-abcdefghijklmnop";
process.env.AUTH_SECRET = SECRET; // middleware reads this directly (never getServerEnv() — see its header comment)

function req(url: string, opts: { method?: string; cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(new URL(url, "http://localhost:3000"), { method: opts.method ?? "GET", headers });
}

async function viewAsCookie(): Promise<string> {
  const token = await signViewAsToken(
    { realUserId: "city-mgr-1", role: "CLUB_MANAGER", clubId: "club-1", cityId: null, previewPositionId: "ADMINISTRATOR" },
    SECRET,
  );
  return `${VIEW_AS_COOKIE}=${token}`;
}

test("MW-A: GET is never blocked, even with an active View As cookie", async () => {
  const res = await middleware(req("/api/control/team", { method: "GET", cookie: await viewAsCookie() }));
  assert.equal(res.status, 200); // NextResponse.next() reports 200 by default
});

test("MW-B: POST with NO View As cookie passes through untouched", async () => {
  const res = await middleware(req("/api/control/plan/tasks", { method: "POST" }));
  assert.equal(res.status, 200);
});

test("MW-C: POST/PUT/PATCH/DELETE with an active View As cookie is blocked with 403 VIEW_AS_READ_ONLY", async () => {
  const cookie = await viewAsCookie();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await middleware(req("/api/control/plan/tasks", { method, cookie }));
    assert.equal(res.status, 403, `method=${method}`);
    const body = await res.json();
    assert.equal(body.error, "VIEW_AS_READ_ONLY", `method=${method}`);
  }
});

test("MW-D: representative mutation families are all blocked — Daily Plan, Academy, Metric, Team/access, role assignment, uploads", async () => {
  const cookie = await viewAsCookie();
  const routes = [
    "/api/plan/tasks/abc/complete",
    "/api/academy/lessons/some-slug/complete",
    "/api/metric/chat",
    "/api/control/team/user-1/access",
    "/api/control/roles",
    "/api/admin/media/upload",
    "/api/control/metric/documents",
  ];
  for (const path of routes) {
    const res = await middleware(req(path, { method: "POST", cookie }));
    assert.equal(res.status, 403, path);
    assert.equal((await res.json()).error, "VIEW_AS_READ_ONLY", path);
  }
});

test("MW-E: the allowlist is honored — view-as/end and /start stay reachable, GET-only routes are unaffected either way", async () => {
  const cookie = await viewAsCookie();
  assert.equal((await middleware(req("/api/control/view-as/end", { method: "POST", cookie }))).status, 200);
  assert.equal((await middleware(req("/api/control/view-as/start", { method: "POST", cookie }))).status, 200);
  assert.equal((await middleware(req("/api/auth/logout", { method: "POST", cookie }))).status, 200);
  assert.equal((await middleware(req("/api/auth/telegram", { method: "POST", cookie }))).status, 200);
  assert.equal((await middleware(req("/api/auth/telegram-web", { method: "POST", cookie }))).status, 200);
});

test("MW-F: an expired View As cookie does not block mutations (nothing active to guard)", async () => {
  const past = Math.floor(Date.now() / 1000) - 60 * 60; // 1h ago, well past the 30-minute max-age
  const token = await signViewAsToken(
    { realUserId: "u", role: "MANAGER", clubId: "club-1", cityId: null, previewPositionId: "CLIENT_MANAGER" },
    SECRET,
    past,
  );
  const res = await middleware(req("/api/control/plan/tasks", { method: "POST", cookie: `${VIEW_AS_COOKIE}=${token}` }));
  assert.equal(res.status, 200);
});

test("MW-G: a tampered/foreign-secret View As cookie does not block mutations (fails closed on the TOKEN, open on the BLOCK — never mistakes garbage for an active preview)", async () => {
  const token = await signViewAsToken(
    { realUserId: "u", role: "MANAGER", clubId: "club-1", cityId: null, previewPositionId: "CLIENT_MANAGER" },
    "a-completely-different-secret!!",
  );
  const res = await middleware(req("/api/control/plan/tasks", { method: "POST", cookie: `${VIEW_AS_COOKIE}=${token}` }));
  assert.equal(res.status, 200);
});
