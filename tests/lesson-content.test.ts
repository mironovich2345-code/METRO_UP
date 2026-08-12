import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBlockData, safeParseBlockData, richDocHasText } from "../src/lib/server/content-schemas";
import { plainToRichDoc } from "../src/lib/rich-text";

/**
 * Lesson content experience — COLLAPSIBLE_TEXT + KEY_TAKEAWAYS block types.
 * Data-level validation is unit tested; React render + DB scenarios are skips.
 */

/* ------------------------- A/B — COLLAPSIBLE_TEXT ----------------------- */

test("A: COLLAPSIBLE_TEXT validates with real content", () => {
  const parsed = parseBlockData("COLLAPSIBLE_TEXT", {
    title: "Текстовая версия урока",
    content: plainToRichDoc("# Заголовок\nПолный текст урока"),
    defaultExpanded: false,
  }) as { title: string; defaultExpanded: boolean };
  assert.equal(parsed.title, "Текстовая версия урока");
});

test("B: empty COLLAPSIBLE_TEXT content is rejected", () => {
  assert.throws(() => parseBlockData("COLLAPSIBLE_TEXT", { content: [] }));
  // whitespace-only spans count as empty
  assert.throws(() =>
    parseBlockData("COLLAPSIBLE_TEXT", { content: [{ type: "paragraph", spans: [{ text: "   " }] }] }),
  );
  assert.equal(richDocHasText([]), false);
});

/* -------------------------- C/D — KEY_TAKEAWAYS ------------------------- */

test("C: KEY_TAKEAWAYS requires at least one item", () => {
  assert.throws(() => parseBlockData("KEY_TAKEAWAYS", { items: [] }));
});

test("D: empty takeaway (no title/text) is rejected", () => {
  assert.throws(() =>
    parseBlockData("KEY_TAKEAWAYS", { items: [{ id: "1", title: "", text: "x", variant: "DEFAULT", order: 1 }] }),
  );
  assert.throws(() =>
    parseBlockData("KEY_TAKEAWAYS", { items: [{ id: "1", title: "T", text: "", variant: "DEFAULT", order: 1 }] }),
  );
});

test("KEY_TAKEAWAYS variant defaults to DEFAULT; order preserved on parse", () => {
  const parsed = parseBlockData("KEY_TAKEAWAYS", {
    items: [
      { id: "a", title: "T1", text: "x", order: 2 },
      { id: "b", title: "T2", text: "y", order: 1 },
    ],
  }) as { items: { id: string; variant: string; order: number }[] };
  assert.equal(parsed.items[0].variant, "DEFAULT");
  assert.equal(parsed.items.find((i) => i.id === "a")?.order, 2); // order kept as authored
});

/* ------------------- I/J — defaultExpanded semantics -------------------- */

test("I: COLLAPSIBLE_TEXT defaultExpanded is false by default (collapsed)", () => {
  const parsed = parseBlockData("COLLAPSIBLE_TEXT", { content: plainToRichDoc("text") }) as { defaultExpanded: boolean; title: string };
  assert.equal(parsed.defaultExpanded, false);
  assert.equal(parsed.title, "Текстовая версия урока"); // default title
});

test("J: defaultExpanded true is honoured", () => {
  const parsed = parseBlockData("COLLAPSIBLE_TEXT", { content: plainToRichDoc("text"), defaultExpanded: true }) as { defaultExpanded: boolean };
  assert.equal(parsed.defaultExpanded, true);
});

/* --------------------- M — no raw HTML injection ----------------------- */

test("M: rich text stores structured nodes, never raw HTML", () => {
  const doc = plainToRichDoc("<script>alert(1)</script> and **bold**");
  const flat = JSON.stringify(doc);
  // No HTML element nodes — only structured node types.
  const allowed = new Set(["paragraph", "heading", "quote", "bulletList", "numberedList"]);
  assert.ok((doc as { type: string }[]).every((n) => allowed.has(n.type)));
  // The angle brackets survive only as literal span TEXT (rendered as text, not markup).
  assert.ok(flat.includes("<script>"));
  assert.equal(flat.includes('"html"'), false);
  // And it validates inside a COLLAPSIBLE_TEXT block.
  assert.doesNotThrow(() => parseBlockData("COLLAPSIBLE_TEXT", { content: doc }));
});

/* --------------- K — legacy block types keep validating ---------------- */

test("K: existing block types still validate (backward compatible)", () => {
  assert.doesNotThrow(() => parseBlockData("TEXT", { doc: plainToRichDoc("hi") }));
  assert.doesNotThrow(() => parseBlockData("INFO_CARD", { title: "T", text: "x", variant: "TIP" }));
  assert.doesNotThrow(() => parseBlockData("CHECKLIST", { items: [{ text: "a" }] }));
  assert.doesNotThrow(() => parseBlockData("SUMMARY", { points: ["a"] }));
  assert.equal(safeParseBlockData("KEY_TAKEAWAYS", { items: [{ id: "1", title: "T", text: "x", variant: "TIP", order: 1 }] }).success, true);
});

/* ---------------- integration scenarios (require Postgres) -------------- */

const skip = { skip: "integration: requires Postgres / React render" } as const;
test("E: block order persisted across save (DB)", skip, () => {});
test("F: CMS create/update block works", skip, () => {});
test("G: Preview renders new blocks", skip, () => {});
test("H: Employee renders new blocks", skip, () => {});
test("L: published existing lesson keeps working", skip, () => {});
test("N: DRAFT changes invisible to employee until Publish", skip, () => {});
