import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scriptContentSchema,
  scriptHasContent,
  instructionBlockSchema,
  instructionBlocksSchema,
  instructionHasContent,
  blockHasContent,
  normalizeBlocks,
  categoryCreateSchema,
  INSTRUCTION_BLOCK_TYPES,
  type InstructionBlock,
} from "../src/lib/server/knowledge-schemas";
import { validateUpload, MEDIA_RULES } from "../src/lib/storage/validation";
import { buildInstructionDoc } from "../src/lib/server/metric/documents";
import type { InstructionDetailDTO } from "../src/lib/api/knowledge-types";
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

/* ======================================================================
 * Instruction IMAGE block (feat/instruction-image-block).
 * IMAGE lives in the same block array; it persists only a media-asset
 * reference + alt/caption (never a storage URL or binary). Pure schema /
 * builder / validation coverage here; storage + DOM cases are honest skips.
 * ==================================================================== */

const IMG_ID = "11111111-1111-1111-1111-111111111111";

test("IMG-A: IMAGE is a valid instruction block type", () => {
  assert.ok(INSTRUCTION_BLOCK_TYPES.includes("IMAGE"));
  const parsed = instructionBlockSchema.safeParse({ type: "IMAGE", mediaAssetId: IMG_ID, alt: "a", caption: "c" });
  assert.equal(parsed.success, true);
});

test("IMG-B: IMAGE is stored and read in its array position (order preserved)", () => {
  const blocks = normalizeBlocks(instructionBlocksSchema.parse([
    { type: "STEPS", title: "Ш", steps: [{ text: "шаг" }] },
    { type: "IMAGE", mediaAssetId: IMG_ID, caption: "скрин" },
    { type: "TEXT", doc: [{ type: "paragraph", spans: [{ text: "после" }] }] },
  ]));
  assert.deepEqual(blocks.map((b) => b.type), ["STEPS", "IMAGE", "TEXT"]);
});

test("IMG-C/D: caption and alt are saved", () => {
  const b = instructionBlockSchema.parse({ type: "IMAGE", mediaAssetId: IMG_ID, alt: "Экран CRAFT", caption: "Кнопка «Журнал платежей»" });
  assert.equal(b.type === "IMAGE" && b.alt, "Экран CRAFT");
  assert.equal(b.type === "IMAGE" && b.caption, "Кнопка «Журнал платежей»");
});

test("IMG-E: an invalid image MIME is rejected server-side", () => {
  assert.equal(validateUpload("IMAGE", "image/gif", 1000).ok, false);
  assert.equal(validateUpload("IMAGE", "image/svg+xml", 1000).ok, false);
  assert.equal(validateUpload("IMAGE", "image/png", 1000).ok, true);
  assert.equal(validateUpload("IMAGE", "image/jpeg", 1000).ok, true);
  assert.equal(validateUpload("IMAGE", "image/webp", 1000).ok, true);
});

test("IMG-F: an oversized image is rejected; within the limit is accepted", () => {
  assert.equal(validateUpload("IMAGE", "image/png", MEDIA_RULES.IMAGE.maxBytes + 1).ok, false);
  assert.equal(validateUpload("IMAGE", "image/png", MEDIA_RULES.IMAGE.maxBytes).ok, true);
});

test("IMG-I: existing instructions without IMAGE still validate and publish-gate unchanged", () => {
  const blocks = instructionBlocksSchema.parse([
    { type: "TEXT", doc: [{ type: "paragraph", spans: [{ text: "текст" }] }] },
    { type: "CHECKLIST", title: null, items: [{ text: "пункт" }] },
    { type: "INFO_CARD", title: null, text: "инфо" },
  ]);
  assert.equal(instructionHasContent(blocks), true);
});

test("IMG-J: Metric doc builder indexes caption/alt only — never the storage URL or id", () => {
  const dto: InstructionDetailDTO = {
    id: "i1", title: "CRAFT", slug: "craft", summary: null, categoryId: "c", categoryTitle: "Кат",
    updatedAt: "2026-01-01T00:00:00.000Z",
    blocks: [
      { id: "b1", type: "STEPS", title: "Ш", steps: [{ id: "s1", text: "Открыть CRAFT" }] },
      { id: "b2", type: "IMAGE", mediaAssetId: IMG_ID, url: "https://cdn.example.com/images/secret.png", alt: "alt", caption: "Кнопка Журнал платежей" },
    ],
  };
  const doc = buildInstructionDoc(dto, dto.updatedAt);
  assert.match(doc.content, /Кнопка Журнал платежей/); // caption IS indexed
  assert.doesNotMatch(doc.content, /https?:\/\//);       // no URL
  assert.doesNotMatch(doc.content, new RegExp(IMG_ID));   // no media id / binary ref
});

test("IMG-K: caption/alt are length-capped; XSS-looking text is kept verbatim (rendered as text)", () => {
  assert.equal(instructionBlockSchema.safeParse({ type: "IMAGE", mediaAssetId: IMG_ID, caption: "x".repeat(301) }).success, false);
  const b = instructionBlockSchema.parse({ type: "IMAGE", mediaAssetId: IMG_ID, caption: "<script>alert(1)</script>" });
  // Stored as-is (the renderer escapes it as text — never as HTML).
  assert.equal(b.type === "IMAGE" && b.caption, "<script>alert(1)</script>");
});

test("IMG-M: no user-controlled URL enters storage — extra fields (url/src/onerror) are stripped", () => {
  const parsed = instructionBlockSchema.parse({
    type: "IMAGE", mediaAssetId: IMG_ID, alt: "a", caption: "c",
    url: "javascript:alert(1)", src: "x", onerror: "y", storageKey: "../../etc",
  } as Record<string, unknown>);
  assert.deepEqual(Object.keys(parsed).sort(), ["alt", "caption", "mediaAssetId", "type"]);
  // A non-UUID mediaAssetId is rejected so resolution never runs a bad DB lookup.
  assert.equal(instructionBlockSchema.safeParse({ type: "IMAGE", mediaAssetId: "not-a-uuid" }).success, false);
});

test("IMG-N: a draft IMAGE without an image is allowed but blocks publish; removing it leaves valid content", () => {
  // Draft: an image block with no asset yet is valid to save…
  const draft = instructionBlockSchema.parse({ type: "IMAGE", mediaAssetId: null, alt: "", caption: "" });
  assert.equal(blockHasContent(draft), false);                 // …but is not publishable
  const full = instructionBlockSchema.parse({ type: "IMAGE", mediaAssetId: IMG_ID });
  assert.equal(blockHasContent(full), true);
  // Removing a block (editor delete) never leaves a dangling reference — the
  // remaining array is self-contained and still validates.
  const remaining = instructionBlocksSchema.parse([
    { type: "TEXT", doc: [{ type: "paragraph", spans: [{ text: "ок" }] }] },
  ]);
  assert.equal(instructionHasContent(remaining), true);
});

// Storage + DOM require real R2 / a browser — covered by manual acceptance.
const imgSkip = { skip: "integration: requires R2 storage / DOM" } as const;
test("IMG-G: an employee (non-admin) cannot upload an image (requireAdmin on /api/admin/media/upload)", imgSkip, () => {});
test("IMG-H: an admin can upload an image via the shared media pipeline", imgSkip, () => {});
test("IMG-L: employee renderer keeps the image within content width (no horizontal overflow)", imgSkip, () => {});
