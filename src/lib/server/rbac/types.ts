import type {
  AccessStatus,
  AppRole,
  NetworkRole,
  RoleAssignmentStatus,
  RoleScopeType,
} from "@prisma/client";

export type { NetworkRole, RoleScopeType, RoleAssignmentStatus };

/**
 * One RoleAssignment row's authorization-relevant fields (never the full
 * Prisma row — callers select only what this module needs).
 */
export interface RoleGrant {
  id: string;
  role: NetworkRole;
  scopeType: RoleScopeType;
  cityId: string | null;
  clubId: string | null;
  status: RoleAssignmentStatus;
}

/**
 * Everything `authorize()` and the access-status primitives need about the
 * acting user, assembled once per request. `appRole` is the LEGACY
 * authorization axis (see src/lib/server/authz.ts) — kept only for the
 * PROJECT_ADMIN/system compatibility bridge (hasSystemAccess) and never
 * extended with new business rules. `grants` is the target RBAC source of
 * truth and may contain zero, one, or several rows in any status — callers
 * filter by status/role/scope as needed via scope-core.ts.
 */
export interface ActorContext {
  userId: string;
  appRole: AppRole;
  accessStatus: AccessStatus | null;
  onboardingCompleted: boolean;
  /** EmployeeProfile.clubId — the legacy/base single-club scope. */
  employeeClubId: string | null;
  grants: RoleGrant[];
}
