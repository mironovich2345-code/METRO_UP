import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scriptContentSchema,
  scriptHasContent,
  instructionBlocksSchema,
  instructionHasContent,
  blockHasContent,
  normalizeBlocks,
  categoryCreateSchema,
  type InstructionBlock,
} from "../src/lib/server/knowledge-schemas";
import { SCRIPT_POSITIONS, canAccessScripts } from "../src/lib/knowledge-access";
import { richDocSchema } from "../src/lib/server/content-schemas";
import { canAccessAdmin } from "../src/lib/roles";
import {
  isDemotionFromAdmin,
  isSelfDemotion,
  wouldRemoveLastAdmin,
  managerMissingClub,
} from "../src/lib/server/user-admin-logic";

/**
 * Knowledge base (Scripts + Work Instructions) + ADMIN user management.
 * Pure logic / schema / security-predicate tests here; DB + HTTP scenarios are
 * explicit integration skips (see the manual checklist in the final report).
 */

/* ============================== SCRIPTS ================================== */

/* D — no raw HTML is ever stored or rendered. Rich text accepts only the
 * structured node model; an "html" node or a raw-html field is rejected. */
test("D: script rich text rejects raw HTML nodes (structured-only)", () => {
  assert.equal(richDocSchema.safeParse([{ type: "html", html: "<script>alert(1)</script>" }]).success, false);
  // Angle brackets typed by an author survive only as PLAIN text spans (React escapes them on render).
  const doc = richDocSchema.parse([{ type: "paragraph", spans: [{ text: "<b>привет</b>" }] }]);
  assert.equal(doc[0].type, "paragraph");
});

/* I (script analog) — a script is publishable only with a non-empty SCRIPT. */
test("script publish gate: empty script section is not publishable", () => {
  const empty = scriptContentSchema.parse({});
  assert.equal(scriptHasContent(empty), false);
  const filled = scriptContentSchema.parse({ script: [{ type: "paragraph", spans: [{ text: "Здравствуйте!" }] }] });
  assert.equal(scriptHasContent(filled), true);
});

test("scriptContentSchema strips unknown keys and defaults sections", () => {
  const parsed = scriptContentSchema.parse({ goal: "Продать карту", evil: "x" } as Record<string, unknown>);
  assert.equal(parsed.goal, "Продать карту");
  assert.deepEqual(parsed.keyQuestions, []);
  assert.deepEqual(parsed.doNotSay, []);
  assert.equal("evil" in parsed, false);
});

/* Position gating — scripts only for sales-facing positions. */
test("scripts access is limited to CLIENT_MANAGER / NIGHT_MANAGER", () => {
  assert.deepEqual([...SCRIPT_POSITIONS].sort(), ["CLIENT_MANAGER", "NIGHT_MANAGER"]);
  assert.equal(canAccessScripts("CLIENT_MANAGER"), true);
  assert.equal(canAccessScripts("NIGHT_MANAGER"), true);
  assert.equal(canAccessScripts("ADMINISTRATOR"), false);
  assert.equal(canAccessScripts(null), false);
  assert.equal(canAccessScripts(undefined), false);
});

test("category schema requires a real title", () => {
  assert.equal(categoryCreateSchema.safeParse({ title: "Возражения" }).success, true);
  assert.equal(categoryCreateSchema.safeParse({ title: "x" }).success, false);
});

/* ============================ INSTRUCTIONS =============================== */

/* H — instruction blocks are validated by a discriminated union. */
test("H: instruction blocks validate by type; unknown type rejected", () => {
  const ok = instructionBlocksSchema.safeParse([
    { type: "TEXT", doc: [{ type: "paragraph", spans: [{ text: "Шаг" }] }] },
    { type: "STEPS", steps: [{ text: "Открыть кассу" }] },
    { type: "CHECKLIST", items: [{ text: "Проверить документы" }] },
    { type: "INFO_CARD", text: "Рабочие часы 9–22" },
    { type: "WARNING", text: "Не выдавать карту без паспорта" },
  ]);
  assert.equal(ok.success, true);
  assert.equal(instructionBlocksSchema.safeParse([{ type: "VIDEO", url: "x" }]).success, false);
});

/* I — an instruction with no content (or an empty block) is not publishable. */
test("I: empty instruction / empty block is not publishable", () => {
  assert.equal(instructionHasContent([]), false);
  const emptySteps = instructionBlocksSchema.parse([{ type: "STEPS", steps: [] }]) as InstructionBlock[];
  assert.equal(instructionHasContent(emptySteps), false);
  const good = instructionBlocksSchema.parse([{ type: "INFO_CARD", text: "Важно" }]) as InstructionBlock[];
  assert.equal(instructionHasContent(good), true);
  assert.equal(blockHasContent(good[0]), true);
});

/* J — a CHECKLIST block is reference-only: it has no completion state and can
 * never become a DailyTask (Daily Plan stays a separate system). */
test("J: instruction checklist is reference-only (no completion / DailyTask fields)", () => {
  const parsed = instructionBlocksSchema.parse([
    { type: "CHECKLIST", items: [{ text: "Проверить кассу", done: true, dailyTaskId: "x" }] },
  ]) as InstructionBlock[];
  const block = parsed[0];
  assert.equal(block.type, "CHECKLIST");
  if (block.type === "CHECKLIST") {
    const item = block.items[0] as Record<string, unknown>;
    assert.equal(item.text, "Проверить кассу");
    assert.equal("done" in item, false); // completion never stored
    assert.equal("dailyTaskId" in item, false); // never linked to Daily Plan
  }
});

test("normalizeBlocks assigns stable ids to blocks and items", () => {
  const out = normalizeBlocks(
    instructionBlocksSchema.parse([
      { type: "CHECKLIST", items: [{ text: "A" }, { id: "keep", text: "B" }] },
      { type: "STEPS", steps: [{ text: "S1" }] },
    ]) as InstructionBlock[],
  );
  assert.ok(out[0].id && out[1].id);
  if (out[0].type === "CHECKLIST") {
    assert.ok(out[0].items[0].id?.startsWith("item-"));
    assert.equal(out[0].items[1].id, "keep");
  }
  if (out[1].type === "STEPS") assert.ok(out[1].steps[0].id?.startsWith("step-"));
});

/* ========================= USER MANAGEMENT ============================== */

/* L / M / N — only ADMIN may reach the user-management writes (route guard). */
test("L/M/N: only ADMIN passes the admin access gate", () => {
  assert.equal(canAccessAdmin("ADMIN"), true);
  assert.equal(canAccessAdmin("SPM"), false);
  assert.equal(canAccessAdmin("CLUB_MANAGER"), false);
  assert.equal(canAccessAdmin("EMPLOYEE"), false);
});

/* O — an ADMIN cannot demote themselves. */
test("O: self-demotion of ADMIN is detected", () => {
  assert.equal(isSelfDemotion("u1", "u1", "ADMIN", "SPM"), true);
  assert.equal(isSelfDemotion("u1", "u1", "ADMIN", "ADMIN"), false); // no role change
  assert.equal(isSelfDemotion("admin", "other", "ADMIN", "EMPLOYEE"), false); // demoting someone else is allowed
});

/* Last-admin protection — never leave the system without an ADMIN. */
test("last-admin: demoting the only admin is blocked", () => {
  assert.equal(isDemotionFromAdmin("ADMIN", "EMPLOYEE"), true);
  assert.equal(isDemotionFromAdmin("SPM", "EMPLOYEE"), false);
  assert.equal(wouldRemoveLastAdmin(true, 1), true);
  assert.equal(wouldRemoveLastAdmin(true, 2), false);
  assert.equal(wouldRemoveLastAdmin(false, 1), false);
});

/* K — assigning CLUB_MANAGER requires a concrete club. */
test("K: CLUB_MANAGER assignment requires a club", () => {
  assert.equal(managerMissingClub("CLUB_MANAGER", null), true);
  assert.equal(managerMissingClub("CLUB_MANAGER", "club-1"), false);
  assert.equal(managerMissingClub("EMPLOYEE", null), false);
});

/* ------------------ integration scenarios (require Postgres) ------------- */

const skip = { skip: "integration: requires Postgres + running server" } as const;
test("A: employee API never returns a DRAFT script", skip, () => {});
test("B: employee API returns PUBLISHED scripts", skip, () => {});
test("C: employee API never returns an ARCHIVED script", skip, () => {});
test("E: scripts are grouped by active category in order", skip, () => {});
test("F: employee API never returns a DRAFT instruction", skip, () => {});
test("G: employee API returns PUBLISHED instructions", skip, () => {});
test("P: actor is taken from session, never from the request body", skip, () => {});
test("Q: a newly-assigned CLUB_MANAGER is scoped to their own club only", skip, () => {});
test("R: every role/club change writes a UserAuditLog (before/after)", skip, () => {});
test("editing a PUBLISHED script/instruction is blocked until returned to draft", skip, () => {});
test("CLUB_MANAGER / SPM cannot reach the scripts/instructions/users CMS APIs (403)", skip, () => {});
