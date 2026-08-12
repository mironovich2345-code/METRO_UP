import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAdmin, canAccessSpm } from "../src/lib/roles";

/**
 * Role access rules (single-role model). ADMIN keeps /admin AND gets full /spm;
 * SPM has /spm only; CLUB_MANAGER/EMPLOYEE have neither. Pure rules are unit
 * tested here; DB/HTTP write scenarios are integration skips.
 */

test("A/B: ADMIN can access /admin AND /spm", () => {
  assert.equal(canAccessAdmin("ADMIN"), true);
  assert.equal(canAccessSpm("ADMIN"), true);
});

test("G/H: SPM can access /spm but NOT /admin", () => {
  assert.equal(canAccessSpm("SPM"), true);
  assert.equal(canAccessAdmin("SPM"), false);
});

test("I: CLUB_MANAGER cannot access /spm or /admin", () => {
  assert.equal(canAccessSpm("CLUB_MANAGER"), false);
  assert.equal(canAccessAdmin("CLUB_MANAGER"), false);
});

test("K: EMPLOYEE cannot access /spm or /admin", () => {
  assert.equal(canAccessSpm("EMPLOYEE"), false);
  assert.equal(canAccessAdmin("EMPLOYEE"), false);
});

/* ---------------- integration scenarios (require Postgres + HTTP) -------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("C: ADMIN → POST /api/spm/sales allowed", skip, () => {});
test("D: ADMIN → publish mystery allowed", skip, () => {});
test("E: ADMIN → calculate rating allowed", skip, () => {});
test("F: ADMIN → publish rating allowed", skip, () => {});
test("J: CLUB_MANAGER → SPM write API 403", skip, () => {});
test("L: EMPLOYEE → SPM write API 403", skip, () => {});
test("M: audit action by ADMIN stores real ADMIN user id (no fake role)", skip, () => {});
test("N: no client role escalation (role read from DB session)", skip, () => {});
