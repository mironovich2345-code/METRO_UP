import { z } from "zod";

const NETWORK_ROLES = ["PROJECT_ADMIN", "OPERATIONS_DIRECTOR", "CITY_MANAGER", "CLUB_MANAGER", "MANAGER"] as const;
const SCOPE_TYPES = ["SYSTEM", "NETWORK", "CITY", "CLUB"] as const;
const ASSIGNMENT_STATUSES = ["PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "ENDED"] as const;

export const createRoleAssignmentSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(NETWORK_ROLES),
    scopeType: z.enum(SCOPE_TYPES),
    cityId: z.string().trim().min(1).max(80).optional().nullable(),
    clubId: z.string().trim().min(1).max(80).optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();
export type CreateRoleAssignmentInput = z.infer<typeof createRoleAssignmentSchema>;

export const revokeRoleAssignmentSchema = z
  .object({ reason: z.string().trim().max(500).optional().nullable() })
  .strict();

export const restoreRoleAssignmentSchema = z
  .object({ reason: z.string().trim().max(500).optional().nullable() })
  .strict();

export const listRoleAssignmentsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.enum(NETWORK_ROLES).optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  cityId: z.string().trim().min(1).max(80).optional(),
  clubId: z.string().trim().min(1).max(80).optional(),
});
