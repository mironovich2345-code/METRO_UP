import { z } from "zod";

/** ADMIN user-management input. Actor is ALWAYS taken from session, never here. */
export const userUpdateSchema = z
  .object({
    role: z.enum(["EMPLOYEE", "CLUB_MANAGER", "SPM", "ADMIN"]).optional(),
    positionId: z.enum(["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"]).optional(),
    cityId: z.string().trim().min(1).max(80).optional(),
    clubId: z.string().trim().min(1).max(80).optional(),
    accessStatus: z.enum(["LIMITED", "PENDING_APPROVAL", "FULL", "SUSPENDED"]).optional(),
  })
  .strict();

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userFilterSchema = z.object({
  cityId: z.string().trim().min(1).optional(),
  clubId: z.string().trim().min(1).optional(),
  role: z.enum(["EMPLOYEE", "CLUB_MANAGER", "SPM", "ADMIN"]).optional(),
  positionId: z.enum(["CLIENT_MANAGER", "NIGHT_MANAGER", "ADMINISTRATOR"]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});
export type UserFilterInput = z.infer<typeof userFilterSchema>;
