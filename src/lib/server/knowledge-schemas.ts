import { z } from "zod";
import { randomUUID } from "node:crypto";
import { richDocSchema, richDocHasText, type RichDoc } from "./content-schemas";

/**
 * Validation for the knowledge base (Scripts + Work Instructions). Unknown keys
 * are stripped so clients can never inject server-owned fields. Rich text is the
 * SAME structured document model as Academy (never raw HTML). These are
 * standalone knowledge objects — not linked to Lesson.
 */

const title = z.string().trim().min(2, "Минимум 2 символа").max(160);
const shortText = z.string().trim().max(4000);
const listItem = z.string().trim().min(1).max(500);

/* ------------------------------- categories ------------------------------ */

export const categoryCreateSchema = z.object({
  title,
  description: shortText.optional().nullable(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial();
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

/* --------------------------------- scripts ------------------------------- */

/** Structured script sections. `script` is the full conversation (RichText). */
export const scriptContentSchema = z.object({
  whenToUse: shortText.default(""),
  goal: shortText.default(""),
  keyQuestions: z.array(listItem).max(50).default([]),
  script: richDocSchema.default([]),
  doNotSay: z.array(listItem).max(50).default([]),
  nextStep: shortText.default(""),
});
export type ScriptContent = z.infer<typeof scriptContentSchema>;

export const scriptCreateSchema = z.object({
  categoryId: z.string().uuid(),
  title,
  description: shortText.optional().nullable(),
  content: scriptContentSchema.optional(),
  order: z.number().int().min(0).optional(),
});
export const scriptUpdateSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: title.optional(),
  description: shortText.optional().nullable(),
  content: scriptContentSchema.optional(),
  order: z.number().int().min(0).optional(),
});
export type ScriptCreate = z.infer<typeof scriptCreateSchema>;
export type ScriptUpdate = z.infer<typeof scriptUpdateSchema>;

/** A script is publishable when its main SCRIPT section has real content. */
export function scriptHasContent(content: ScriptContent): boolean {
  return richDocHasText(content.script as RichDoc);
}

/* ------------------------------ instructions ----------------------------- */

const blockText = z.object({
  id: z.string().optional(),
  type: z.literal("TEXT"),
  doc: richDocSchema,
});
const blockChecklist = z.object({
  id: z.string().optional(),
  type: z.literal("CHECKLIST"),
  title: z.string().trim().max(200).optional().nullable(),
  // Reference checklist ONLY — no completion state, never becomes a DailyTask.
  items: z.array(z.object({ id: z.string().optional(), text: listItem })).max(50),
});
const blockInfoCard = z.object({
  id: z.string().optional(),
  type: z.literal("INFO_CARD"),
  title: z.string().trim().max(200).optional().nullable(),
  text: shortText,
});
const blockWarning = z.object({
  id: z.string().optional(),
  type: z.literal("WARNING"),
  title: z.string().trim().max(200).optional().nullable(),
  text: shortText,
});
const blockSteps = z.object({
  id: z.string().optional(),
  type: z.literal("STEPS"),
  title: z.string().trim().max(200).optional().nullable(),
  steps: z.array(z.object({ id: z.string().optional(), text: listItem })).max(50),
});

export const instructionBlockSchema = z.discriminatedUnion("type", [
  blockText,
  blockChecklist,
  blockInfoCard,
  blockWarning,
  blockSteps,
]);
export type InstructionBlock = z.infer<typeof instructionBlockSchema>;
export const instructionBlocksSchema = z.array(instructionBlockSchema).max(100);

export const INSTRUCTION_BLOCK_TYPES = ["TEXT", "STEPS", "CHECKLIST", "INFO_CARD", "WARNING"] as const;

export const instructionCreateSchema = z.object({
  categoryId: z.string().uuid(),
  title,
  summary: shortText.optional().nullable(),
  blocks: instructionBlocksSchema.optional(),
  order: z.number().int().min(0).optional(),
});
export const instructionUpdateSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: title.optional(),
  summary: shortText.optional().nullable(),
  blocks: instructionBlocksSchema.optional(),
  order: z.number().int().min(0).optional(),
});
export type InstructionCreate = z.infer<typeof instructionCreateSchema>;
export type InstructionUpdate = z.infer<typeof instructionUpdateSchema>;

/** True when a single block carries real content (used for publish gating). */
export function blockHasContent(b: InstructionBlock): boolean {
  switch (b.type) {
    case "TEXT":
      return richDocHasText(b.doc as RichDoc);
    case "CHECKLIST":
      return b.items.length > 0;
    case "STEPS":
      return b.steps.length > 0;
    case "INFO_CARD":
    case "WARNING":
      return b.text.trim().length > 0;
    default:
      return false;
  }
}

/** An instruction is publishable when it has ≥1 block and no empty block. */
export function instructionHasContent(blocks: InstructionBlock[]): boolean {
  return blocks.length > 0 && blocks.every(blockHasContent);
}

/**
 * Assign stable ids to blocks/items that lack one (editing never re-keys the
 * ones already saved). Ids are content-independent (not derived from text).
 */
export function normalizeBlocks(blocks: InstructionBlock[] | undefined): InstructionBlock[] {
  if (!blocks) return [];
  return blocks.map((b) => {
    const id = b.id ?? `block-${randomUUID()}`;
    if (b.type === "CHECKLIST") {
      return { ...b, id, items: b.items.map((it) => ({ ...it, id: it.id ?? `item-${randomUUID()}` })) };
    }
    if (b.type === "STEPS") {
      return { ...b, id, steps: b.steps.map((it) => ({ ...it, id: it.id ?? `step-${randomUUID()}` })) };
    }
    return { ...b, id };
  });
}
