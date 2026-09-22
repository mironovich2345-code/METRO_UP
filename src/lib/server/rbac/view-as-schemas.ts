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
 *
 * Sprint 1 / Phase 2D, section 5 — previewPositionId. EmployeePosition has
 * three distinct, non-overlapping values with no canonical "MANAGER" mapping
 * (src/content/positions.ts) and Scripts visibility genuinely differs by
 * position (knowledge-access.ts's SCRIPT_POSITIONS) — so for role=MANAGER
 * the caller MUST pass one explicitly; this is never defaulted/guessed.
 * CLUB_MANAGER/CITY_MANAGER previews don't use it for gating (their preview
 * surface is Team/Control, not position-gated Mini-App content) and must
 * NOT send it — same "reject ambiguity, don't silently resolve" contract
 * as clubId/cityId above.
 */
export const startViewAsSchema = z
  .object({
    role: z.enum(["MANAGER", "CLUB_MANAGER", "CITY_MANAGER"]),
    clubId: z.string().trim().min(1).max(80).optional().nullable(),
    cityId: z.string().trim().min(1).max(80).optional().nullable(),
    previewPositionId: z.enum(["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"]).optional().nullable(),
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
    } else {
      // CITY_MANAGER
      if (hasClub && hasCity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cityId"],
          message: "clubId и cityId взаимоисключающие — укажите только одно",
        });
      }
    }

    if (val.role === "MANAGER" && !val.previewPositionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previewPositionId"],
        message: "previewPositionId обязателен для просмотра в роли MANAGER",
      });
    }
    if (val.role !== "MANAGER" && val.previewPositionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previewPositionId"],
        message: "previewPositionId допустим только для роли MANAGER",
      });
    }
  });
