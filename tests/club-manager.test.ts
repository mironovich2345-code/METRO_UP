import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessAdmin, canAccessSpm, canAccessControl, canManageClub } from "../src/lib/roles";
import { taskMode } from "../src/lib/server/daily-plan-catalog";
import { managerTaskSchema, templateCreateSchema } from "../src/lib/server/club-plan-schemas";

/**
 * CLUB_MANAGER Control v1 + Daily Plan v2. Pure permission/logic + input-schema
 * tests here; DB/HTTP + cross-club security scenarios are integration skips.
 */

/* --------------------------- permission matrix -------------------------- */

test("Control entry: ADMIN, SPM, CLUB_MANAGER allowed; EMPLOYEE denied", () => {
  assert.equal(canAccessControl("ADMIN"), true);
  assert.equal(canAccessControl("SPM"), true);
  assert.equal(canAccessControl("CLUB_MANAGER"), true);
  assert.equal(canAccessControl("EMPLOYEE"), false);
});

test("Club plan/team: CLUB_MANAGER + ADMIN; not SPM/EMPLOYEE", () => {
  assert.equal(canManageClub("CLUB_MANAGER"), true);
  assert.equal(canManageClub("ADMIN"), true);
  assert.equal(canManageClub("SPM"), false);
  assert.equal(canManageClub("EMPLOYEE"), false);
});

test("canAccessSpm is NOT widened to CLUB_MANAGER (module separation)", () => {
  assert.equal(canAccessSpm("CLUB_MANAGER"), false); // no SPM APIs for managers
  assert.equal(canAccessAdmin("CLUB_MANAGER"), false); // no CMS for managers
  assert.equal(canAccessSpm("SPM"), true);
});

/* ------------------- manager task completion is manual ------------------ */

test("MANAGER tasks are manual (employee-completable, not forgeable as auto)", () => {
  assert.equal(taskMode("MANAGER"), "manual");
  assert.equal(taskMode("LEARNING"), "auto"); // system learning stays auto-only
  assert.equal(taskMode("SALES"), "blocked");
});

/* --------------------------- input validation --------------------------- */

test("manager task schema: valid targets, date format, USER needs uuid", () => {
  const base = { title: "Обзвонить клиентов", date: "2026-08-13" };
  assert.equal(managerTaskSchema.safeParse({ ...base, target: { type: "ALL_MANAGERS" } }).success, true);
  assert.equal(managerTaskSchema.safeParse({ ...base, target: { type: "POSITION", position: "CLIENT_MANAGER" } }).success, true);
  assert.equal(
    managerTaskSchema.safeParse({ ...base, target: { type: "USER", userId: "00000000-0000-0000-0000-000000000001" } }).success,
    true,
  );
  // invalid: bad date, bad position, non-uuid user
  assert.equal(managerTaskSchema.safeParse({ ...base, date: "13.08.2026", target: { type: "ALL_MANAGERS" } }).success, false);
  assert.equal(managerTaskSchema.safeParse({ ...base, target: { type: "POSITION", position: "ADMINISTRATOR" } }).success, false);
  assert.equal(managerTaskSchema.safeParse({ ...base, target: { type: "USER", userId: "not-a-uuid" } }).success, false);
});

test("template schema accepts null target (all managers) + position", () => {
  assert.equal(templateCreateSchema.safeParse({ title: "Проверить кассу" }).success, true);
  assert.equal(templateCreateSchema.safeParse({ title: "Проверить кассу", targetPosition: "NIGHT_MANAGER", required: true }).success, true);
});

/* --------------- integration scenarios (require Postgres) --------------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("CLUB_MANAGER sees only own club employees", skip, () => {});
test("cross-club: assign task to another club's employee → 403", skip, () => {});
test("CLUB_MANAGER cannot edit/delete SYSTEM tasks/templates", skip, () => {});
test("CLUB_MANAGER cannot call SPM/Admin endpoints", skip, () => {});
test("one-off manager task appears in employee plan and completes (persists)", skip, () => {});
test("recurring template materializes idempotently (no duplicates)", skip, () => {});
test("editing a template does not rewrite historical DailyTask", skip, () => {});
test("no XP awarded for completing a manager task", skip, () => {});
test("actor is taken from server session, never client userId", skip, () => {});
