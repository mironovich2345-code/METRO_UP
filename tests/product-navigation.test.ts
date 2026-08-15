import { test } from "node:test";
import assert from "node:assert/strict";
import { serverOnboardingComplete } from "../src/lib/onboarding-state";
import { canSwitchClub, requestedClubForRole } from "../src/lib/club-scope";
import { canManageClub, canAccessAdmin } from "../src/lib/roles";
import { BOTTOM_NAV_ROUTES } from "../src/lib/nav-items";
import type { AppUserDTO } from "../src/lib/api/types";

/**
 * Sprint: product navigation + onboarding + ADMIN-manager. Pure logic tests
 * here; DOM / Postgres scenarios are explicit integration skips with the manual
 * acceptance list in the final report.
 */

function user(partial: Partial<AppUserDTO>): AppUserDTO {
  return {
    displayName: "Тест",
    role: "EMPLOYEE",
    telegram: { username: null, firstName: null, lastName: null, photoUrl: null },
    onboardingCompleted: false,
    profile: null,
    ...partial,
  };
}
const fullProfile = { cityId: "msk", clubId: "club-1", positionId: "CLIENT_MANAGER" as const, careerLevel: "NEWCOMER" as const, accessStatus: "FULL" as const };

/* ---------------------- onboarding source of truth ---------------------- */

test("A: new user without EmployeeProfile → onboarding (not complete)", () => {
  assert.equal(serverOnboardingComplete(user({ onboardingCompleted: false, profile: null })), false);
  assert.equal(serverOnboardingComplete(null), false);
});

test("B: existing valid profile → onboarding complete (Home)", () => {
  assert.equal(serverOnboardingComplete(user({ onboardingCompleted: true, profile: fullProfile })), true);
});

test("D: role change does not reset onboarding (profile still valid)", () => {
  for (const role of ["EMPLOYEE", "CLUB_MANAGER", "SPM", "ADMIN"] as const) {
    assert.equal(serverOnboardingComplete(user({ role, onboardingCompleted: true, profile: fullProfile })), true);
  }
});

test("F: onboardingCompleted flag without a profile is NOT complete", () => {
  assert.equal(serverOnboardingComplete(user({ onboardingCompleted: true, profile: null })), false);
});

/* --------------------------- ADMIN manager ------------------------------ */

test("G: ADMIN and CLUB_MANAGER may use club plan/team; SPM/EMPLOYEE may not", () => {
  assert.equal(canManageClub("ADMIN"), true);
  assert.equal(canManageClub("CLUB_MANAGER"), true);
  assert.equal(canManageClub("SPM"), false);
  assert.equal(canManageClub("EMPLOYEE"), false); // K
});

test("H/I: only ADMIN may switch club scope (default = own club)", () => {
  assert.equal(canSwitchClub("ADMIN"), true);
  assert.equal(canSwitchClub("CLUB_MANAGER"), false);
  assert.equal(canAccessAdmin("ADMIN"), true);
});

test("J: CLUB_MANAGER cannot switch club — a requested clubId is ignored", () => {
  // Manager: requested clubId is never honored → falls back to own club.
  assert.equal(requestedClubForRole("CLUB_MANAGER", "other-club"), null);
  assert.equal(requestedClubForRole("EMPLOYEE", "other-club"), null);
  // ADMIN: the requested club is honored (then DB-validated in the service).
  assert.equal(requestedClubForRole("ADMIN", "club-9"), "club-9");
  assert.equal(requestedClubForRole("ADMIN", null), null); // default → own club
});

/* --------------------------- bottom nav (L) ----------------------------- */

test("L: bottom nav is Главная·Академия·Метрик·База·Рейтинг (Профиль removed)", () => {
  assert.equal(BOTTOM_NAV_ROUTES.length, 5);
  assert.deepEqual(BOTTOM_NAV_ROUTES.map((r) => r.href), ["/home", "/academy", "/metric", "/knowledge", "/ranking"]);
  // Profile is no longer a tab (reached from the Home header instead).
  assert.equal(BOTTOM_NAV_ROUTES.some((r) => r.href === "/profile"), false);
  // Метрик is the central raised action.
  const metric = BOTTOM_NAV_ROUTES.find((r) => r.href === "/metric");
  assert.equal(metric?.label, "Метрик");
  assert.equal(metric?.central, true);
  // «База» is the single Knowledge Hub entry; Scripts/Instructions keep it active.
  const baza = BOTTOM_NAV_ROUTES.find((r) => r.href === "/knowledge");
  assert.equal(baza?.label, "База");
  assert.deepEqual(baza?.match, ["/scripts", "/instructions"]);
  assert.equal(BOTTOM_NAV_ROUTES.some((r) => r.href === "/scripts" || r.href === "/instructions"), false);
});

/* ------------------ integration scenarios (require Postgres/DOM) --------- */

const skip = { skip: "integration: requires Postgres / DOM / Telegram runtime" } as const;
test("C: existing profile + empty localStorage → Home (server truth)", skip, () => {});
test("E: reopening Mini App does not re-trigger onboarding", skip, () => {});
test("H(db): ADMIN with a club defaults to that club scope", skip, () => {});
test("I(db): ADMIN without a club can select a valid club (server-validated)", skip, () => {});
test("J(db): CLUB_MANAGER passing another clubId still gets only their club", skip, () => {});
test("M: Knowledge hub links to Scripts + Instructions", skip, () => {});
test("N: direct /scripts/[slug] Back falls back to /scripts", skip, () => {});
test("O: direct /instructions/[slug] Back falls back to /instructions", skip, () => {});
test("P: Control shell shows «Вернуться в METRO UP» → employee app", skip, () => {});
test("Q: lesson editor / player has Back to learning", skip, () => {});
test("R: user editor has Back to the employees list", skip, () => {});
