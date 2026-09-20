import { z } from "zod";

export const startViewAsSchema = z
  .object({
    role: z.enum(["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]),
    clubId: z.string().trim().min(1).max(80).optional().nullable(),
    cityId: z.string().trim().min(1).max(80).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();
