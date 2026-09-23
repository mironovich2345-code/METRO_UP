import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeBootstrapDiag,
  getBuildSha,
  newAttemptId,
  sendBootstrapDiag,
} from "../src/lib/bootstrap-diag";

/**
 * iOS bootstrap telemetry (observability only). These lock the privacy contract
 * (only whitelisted fields ever leave/are logged), the attempt-id behaviour, and
 * that a telemetry failure can never break bootstrap.
 */

test("diag: whitelist keeps only safe fields; drops all sensitive/unknown ones", () => {
  const safe = sanitizeBootstrapDiag({
    phase: "auth_fetch_start",
    durationMs: 123.7,
    platform: "iPhone",
    pathname: "/home",
    buildSha: "abc1234",
    attemptId: "att-1",
    // forbidden — must all be stripped:
    initData: "query_id=…&hash=…",
    telegramId: 42,
    userId: "u1",
    name: "Иван",
    username: "ivan",
    phone: "+7999",
    token: "secret",
    cookie: "metro_session=…",
    extra: { nested: true },
  });
  assert.ok(safe);
  // Exactly the allowed keys — proves every forbidden KEY was dropped.
  assert.deepEqual(Object.keys(safe!).sort(), ["attemptId", "buildSha", "durationMs", "pathname", "phase", "platform"].sort());
  assert.equal(safe!.durationMs, 124); // rounded
  // And none of the forbidden VALUES survive in the serialized payload.
  const blob = JSON.stringify(safe);
  for (const secretValue of ["query_id", "hash=", "Иван", "ivan", "+7999", "secret", "metro_session", "nested"]) {
    assert.equal(blob.includes(secretValue), false, `must not leak value ${secretValue}`);
  }
});

test("diag: a payload without a valid phase is rejected", () => {
  assert.equal(sanitizeBootstrapDiag(null), null);
  assert.equal(sanitizeBootstrapDiag({}), null);
  assert.equal(sanitizeBootstrapDiag({ phase: "" }), null);
  assert.equal(sanitizeBootstrapDiag({ phase: 5 }), null);
});

test("diag: fields are length-capped (no unbounded log injection)", () => {
  const safe = sanitizeBootstrapDiag({ phase: "x".repeat(200), pathname: "/".repeat(500), attemptId: "a".repeat(500) });
  assert.ok(safe);
  assert.ok(safe!.phase.length <= 40);
  assert.ok((safe!.pathname ?? "").length <= 120);
  assert.ok((safe!.attemptId ?? "").length <= 64);
});

test("diag: attemptId is unique per call (distinguishes attempts / remounts)", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newAttemptId()));
  assert.equal(ids.size, 200);
  assert.ok([...ids].every((id) => typeof id === "string" && id.length > 0));
});

test("diag: getBuildSha falls back to 'unknown' when unset", () => {
  const prev = process.env.NEXT_PUBLIC_BUILD_SHA;
  delete process.env.NEXT_PUBLIC_BUILD_SHA;
  assert.equal(getBuildSha(), "unknown");
  process.env.NEXT_PUBLIC_BUILD_SHA = "deadbeef";
  assert.equal(getBuildSha(), "deadbeef");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_BUILD_SHA;
  else process.env.NEXT_PUBLIC_BUILD_SHA = prev;
});

test("diag: sendBootstrapDiag never throws (no window in node → no-op)", () => {
  assert.doesNotThrow(() => sendBootstrapDiag({ phase: "client_mounted", attemptId: "att-x" }));
});

test("diag: sendBootstrapDiag swallows a throwing transport", () => {
  // Node's global `navigator` is read-only, so we exercise the fetch fallback
  // path (real navigator has no sendBeacon): make window present and fetch throw.
  const g = globalThis as unknown as { window?: unknown; fetch?: unknown };
  const savedWin = g.window, savedFetch = g.fetch;
  try {
    g.window = { location: { pathname: "/home" } };
    g.fetch = () => { throw new Error("fetch boom"); };
    assert.doesNotThrow(() => sendBootstrapDiag({ phase: "auth_timeout", attemptId: "att-y", durationMs: 9000 }));
  } finally {
    g.window = savedWin; g.fetch = savedFetch;
  }
});

/* ---- provider-mount / ordered-phase cases need React runtime → skips ------ */
const skip = { skip: "integration: requires React runtime / a browser" } as const;
test("same bootstrap attempt shares one attemptId; a retry rolls a new one", skip, () => {});
test("a new AppUserProvider mount emits client_mounted with a new attemptId", skip, () => {});
test("timeout path emits auth_timeout with durationMs", skip, () => {});
test("successful path emits ordered core phases (bootstrap_start → gate_ready)", skip, () => {});
