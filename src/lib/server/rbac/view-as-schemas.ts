import { z } from "zod";

/**
 * Sprint 1 / Phase 2C, section 7 — the scope for a View As request must be
 * UNAMBIGUOUS. Before this, clubId and cityId could both be sent at once;
 * canStartViewAs (rbac/authorize-core.ts) silently preferred clubId and
 * ignored cityId, which is loose input handling, not a privilege issue, but
 * still the wrong contract — the caller's ambiguous intent should be
 * rejected (400), never silently resolved one way. Mirrors the same
 * (role -> scope shape) rules isValidGrantShape() already enforces for
 * RoleAssignment creation:
 * - MANAGER / CLUB_MANAGER: clubId required, cityId must be absent.
 * - CITY_MANAGER: clubId XOR cityId (a point-exception club preview, or a
 *   whole-city preview) — or NEITHER, for the trivial "preview as myself /
 *   jump back to the top-level view" case (VIEWAS-E) — but never both.
 */
export const startViewAsSchema = z
  .object({
    role: z.enum(["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]),
    clubId: z.string().trim().min(1).max(80).optional().nullable(),
    cityId: z.string().trim().min(1).max(80).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasClub = !!val.clubId;
    const hasCity = !!val.cityId;

    if (val.role === "MANAGER" || val.role === "CLUB_MANAGER") {
      if (!hasClub) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["clubId"], message: "clubId обязателен для этой роли предпросмотра" });
      }
      if (hasCity) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cityId"], message: "cityId недопустим для этой роли предпросмотра" });
      }
      return;
    }
    // CITY_MANAGER
    if (hasClub && hasCity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cityId"],
        message: "clubId и cityId взаимоисключающие — укажите только одно",
      });
    }
  });
