import { z } from "zod";

/** Metric document metadata validation (shared by the create + update routes). */
export const DOC_CATEGORY_VALUES = [
  "TRAINING_MANUAL", "CLUB_RULES", "WORK_REGULATION", "CONTRACT_TEMPLATE",
  "SALES_MATERIAL", "FINANCE_CASH", "REFUNDS", "HR", "OTHER",
] as const;

export const metaSchema = z.object({
  title: z.string().trim().min(2, "Минимум 2 символа").max(200),
  category: z.enum(DOC_CATEGORY_VALUES),
  description: z.string().trim().max(2000).optional().nullable(),
  positionScope: z.enum(["ALL", "SALES"]).default("ALL"),
  versionLabel: z.string().trim().max(80).optional().nullable(),
  effectiveFrom: z.string().trim().min(1).optional().nullable(),
  effectiveTo: z.string().trim().min(1).optional().nullable(),
});
