import { z } from "zod";

const POSITIONS = ["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");

export const managerTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  date: dateStr,
  required: z.boolean().optional(),
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
  defaultOrder: z.number().int().min(0).optional(),
});

export const templateUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  targetPosition: z.enum(POSITIONS).optional().nullable(),
  required: z.boolean().optional(),
  isActive: z.boolean().optional(),
  defaultOrder: z.number().int().min(0).optional(),
});

export const templateReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });
