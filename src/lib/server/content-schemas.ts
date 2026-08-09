import { z } from "zod";

/**
 * Validation schemas for the content CMS. Unknown keys are stripped so clients
 * can never inject privileged/server-owned fields. Rich text is stored as
 * STRUCTURED JSON (never raw unsanitized HTML).
 */

/* --------------------------------- shared -------------------------------- */

const title = z.string().trim().min(2, "Минимум 2 символа").max(160);
const optionalText = z.string().trim().max(4000).optional().nullable();
const order = z.number().int().min(0).optional();

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/* ------------------------------ rich text -------------------------------- */
// Minimal structured document: paragraph / heading / lists / quote with
// bold+italic spans. No raw HTML is ever stored or rendered.

export const richSpanSchema = z.object({
  text: z.string().max(4000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
});

export const richNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), spans: z.array(richSpanSchema).max(200) }),
  z.object({
    type: z.literal("heading"),
    level: z.number().int().min(1).max(3),
    spans: z.array(richSpanSchema).max(200),
  }),
  z.object({ type: z.literal("quote"), spans: z.array(richSpanSchema).max(200) }),
  z.object({
    type: z.literal("bulletList"),
    items: z.array(z.object({ spans: z.array(richSpanSchema).max(200) })).max(100),
  }),
  z.object({
    type: z.literal("numberedList"),
    items: z.array(z.object({ spans: z.array(richSpanSchema).max(200) })).max(100),
  }),
]);

export const richDocSchema = z.array(richNodeSchema).max(200);
export type RichDoc = z.infer<typeof richDocSchema>;

/* ---------------------------- block data (per type) ---------------------- */

export const INFO_CARD_VARIANTS = ["DEFAULT", "TIP", "IMPORTANT", "WARNING"] as const;

export const BLOCK_TYPES = [
  "VIDEO",
  "TEXT",
  "IMAGE",
  "INFO_CARD",
  "CHECKLIST",
  "SUMMARY",
] as const;
export type EditableBlockType = (typeof BLOCK_TYPES)[number];

export const blockDataSchemas = {
  // media ids are optional at draft time; publish validation requires READY media.
  VIDEO: z.object({
    mediaAssetId: z.string().uuid().optional().nullable(),
    posterMediaAssetId: z.string().uuid().optional().nullable(),
    caption: z.string().max(300).optional().nullable(),
  }),
  TEXT: z.object({ doc: richDocSchema }),
  IMAGE: z.object({
    mediaAssetId: z.string().uuid().optional().nullable(),
    alt: z.string().max(300).optional().nullable(),
    caption: z.string().max(300).optional().nullable(),
  }),
  INFO_CARD: z.object({
    title: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(2000),
    variant: z.enum(INFO_CARD_VARIANTS).default("DEFAULT"),
  }),
  CHECKLIST: z.object({
    title: z.string().max(160).optional().nullable(),
    items: z
      .array(z.object({ text: z.string().trim().min(1).max(300) }))
      .min(1, "Добавьте хотя бы один пункт")
      .max(50),
  }),
  SUMMARY: z.object({
    title: z.string().max(160).optional().nullable(),
    points: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  }),
} as const;

/** Validate a block's `data` against its `type`. Returns parsed data or throws. */
export function parseBlockData(type: EditableBlockType, data: unknown) {
  const schema = blockDataSchemas[type];
  return schema.parse(data);
}

export function safeParseBlockData(type: string, data: unknown) {
  const schema = (blockDataSchemas as Record<string, z.ZodTypeAny>)[type];
  if (!schema) return { success: false as const, error: "UNKNOWN_BLOCK_TYPE" };
  const r = schema.safeParse(data);
  return r.success
    ? { success: true as const, data: r.data }
    : { success: false as const, error: "INVALID_BLOCK_DATA" };
}

/* ------------------------------ program/day/course ----------------------- */

export const programCreateSchema = z.object({
  title,
  description: optionalText,
});
export const programUpdateSchema = z.object({
  title: title.optional(),
  description: optionalText,
  order,
});

export const dayCreateSchema = z.object({
  programId: z.string().uuid(),
  title,
  description: optionalText,
  dayNumber: z.number().int().min(1),
  order,
});
export const dayUpdateSchema = z.object({
  title: title.optional(),
  description: optionalText,
  dayNumber: z.number().int().min(1).optional(),
  order,
});

export const courseCreateSchema = z.object({
  programId: z.string().uuid(),
  trainingDayId: z.string().uuid().optional().nullable(),
  title,
  shortDescription: optionalText,
  order,
});
export const courseUpdateSchema = z.object({
  title: title.optional(),
  shortDescription: optionalText,
  trainingDayId: z.string().uuid().optional().nullable(),
  order,
});

/* --------------------------------- lesson -------------------------------- */

export const lessonCreateSchema = z.object({
  courseId: z.string().uuid(),
  title,
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Только латиница, цифры и дефис")
    .min(2)
    .max(120)
    .optional(),
  shortDescription: optionalText,
  durationMinutes: z.number().int().min(0).max(600).optional(),
  xpReward: z.number().int().min(0).max(100000).optional(),
  isRequired: z.boolean().optional(),
  order,
});
export const lessonUpdateSchema = z.object({
  title: title.optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Только латиница, цифры и дефис")
    .min(2)
    .max(120)
    .optional(),
  shortDescription: optionalText,
  durationMinutes: z.number().int().min(0).max(600).optional(),
  xpReward: z.number().int().min(0).max(100000).optional(),
  isRequired: z.boolean().optional(),
  order,
});

/* --------------------------------- blocks -------------------------------- */

export const blockCreateSchema = z.object({
  lessonId: z.string().uuid(),
  type: z.enum(BLOCK_TYPES),
  data: z.unknown(),
  order,
});
export const blockUpdateSchema = z.object({
  data: z.unknown().optional(),
  order,
});
export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/* ---------------------------------- quiz --------------------------------- */

export const QUESTION_TYPES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] as const;

export const quizOptionInputSchema = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
  order,
});
export const quizQuestionInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  type: z.enum(QUESTION_TYPES),
  explanation: z.string().max(1000).optional().nullable(),
  order,
  options: z.array(quizOptionInputSchema).min(2).max(10),
});
export const quizUpsertSchema = z.object({
  title,
  description: optionalText,
  passingPercent: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(50).optional().nullable(),
  xpReward: z.number().int().min(0).max(100000).optional(),
  questions: z.array(quizQuestionInputSchema).min(1).max(50),
});
export type QuizUpsertInput = z.infer<typeof quizUpsertSchema>;

/* ----------------------------- media & submit ---------------------------- */

export const mediaUploadSchema = z.object({
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});
export const mediaCompleteSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
});

export const quizSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        optionIds: z.array(z.string().uuid()).max(10),
      }),
    )
    .min(1)
    .max(50),
});
export type QuizSubmitInput = z.infer<typeof quizSubmitSchema>;
