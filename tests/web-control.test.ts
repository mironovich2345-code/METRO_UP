import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAdmin, canAccessSpm } from "../src/lib/roles";

/**
 * Web Control portal access matrix. Control access = canAccessSpm (SPM|ADMIN);
 * the Learning/Media sections are ADMIN-only (canAccessAdmin). Pure rules are
 * unit-tested; login/redirect/HTTP flows are integration skips.
 */

test("A/B/C: Control portal is reachable by ADMIN and SPM", () => {
  assert.equal(canAccessSpm("ADMIN"), true);
  assert.equal(canAccessSpm("SPM"), true);
});

test("D: EMPLOYEE and CLUB_MANAGER are denied Control", () => {
  assert.equal(canAccessSpm("EMPLOYEE"), false);
  assert.equal(canAccessSpm("CLUB_MANAGER"), false);
});

test("E: ADMIN sees Learning (+ all SPM sections)", () => {
  assert.equal(canAccessAdmin("ADMIN"), true); // Learning + Media
  assert.equal(canAccessSpm("ADMIN"), true); // Sales/Mystery/Rating
});

test("F: SPM does NOT see Learning/Media (only SPM sections)", () => {
  assert.equal(canAccessAdmin("SPM"), false);
  assert.equal(canAccessSpm("SPM"), true);
});

/* ---------------- integration scenarios (require Postgres + HTTP) -------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("A: unauthenticated /control → redirect /control/login", skip, () => {});
test("B: ADMIN web login → /control", skip, () => {});
test("C: SPM web login → /control", skip, () => {});
test("G: ADMIN opens existing lesson editor", skip, () => {});
test("H: guided lesson creation flow works", skip, () => {});
test("I: video upload R2 pipeline unchanged", skip, () => {});
test("J: sales save persists", skip, () => {});
test("K: mystery draft persists", skip, () => {});
test("L: mystery publish works", skip, () => {});
test("M: rating calculation works", skip, () => {});
test("N: logout destroys session", skip, () => {});
test("O: no mock data introduced", skip, () => {});
