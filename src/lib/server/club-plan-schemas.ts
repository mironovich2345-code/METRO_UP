import { z } from "zod";
import { randomUUID } from "node:crypto";

const POSITIONS = ["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
const priority = z.enum(["NORMAL", "HIGH"]);
const timeHint = z.string().trim().max(40).optional().nullable();

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1).max(300),
  required: z.boolean().optional().default(true),
  order: z.number().int().min(0).optional(),
});
export const checklistSchema = z.array(checklistItemSchema).max(30);
export type ChecklistInput = z.infer<typeof checklistSchema>;

export interface NormalizedChecklistItem {
  id: string;
  text: string;
  required: boolean;
  order: number;
}
/** Assign stable ids to new items (keep existing ids) and normalize order. */
export function normalizeChecklist(input: ChecklistInput | undefined | null): NormalizedChecklistItem[] {
  if (!input || input.length === 0) return [];
  return input.map((it, i) => ({
    id: it.id ?? `custom-${randomUUID()}`,
    text: it.text,
    required: it.required ?? true,
    order: it.order ?? i + 1,
  }));
}

export const managerTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  date: dateStr,
  required: z.boolean().optional(),
  priority: priority.optional(),
  timeHint,
  checklist: checklistSchema.optional(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("USER"), userId: z.string().uuid() }),
    z.object({ type: z.literal("POSITION"), position: z.enum(["CLIENT_MANAGER", "NIGHT_MANAGER"]) }),
    z.object({ type: z.literal("ALL_MANAGERS") }),
  ]),
});

export const templateCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  targetPosition: z.enum(POSITIONS).optional().nullable(),
  required: z.boolean().optional(),
  priority: priority.optional(),
  timeHint,
  checklist: checklistSchema.optional(),
  defaultOrder: z.number().int().min(0).optional(),
});

export const templateUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  targetPosition: z.enum(POSITIONS).optional().nullable(),
  required: z.boolean().optional(),
  priority: priority.optional(),
  timeHint,
  checklist: checklistSchema.optional(),
  isActive: z.boolean().optional(),
  defaultOrder: z.number().int().min(0).optional(),
});

export const templateReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });
