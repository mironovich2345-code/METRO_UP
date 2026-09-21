/** Client-side mirror of RoleAssignment (Sprint 1 / Phase 2B). */
export type NetworkRoleDTO = "PROJECT_ADMIN" | "OPERATIONS_DIRECTOR" | "CITY_MANAGER" | "CLUB_MANAGER" | "MANAGER";
export type RoleScopeTypeDTO = "SYSTEM" | "NETWORK" | "CITY" | "CLUB";
export type RoleAssignmentStatusDTO = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "ENDED";

export interface RoleAssignmentRowDTO {
  id: string;
  userId: string;
  userDisplayName: string;
  role: NetworkRoleDTO;
  scopeType: RoleScopeTypeDTO;
  cityId: string | null;
  cityName: string | null;
  clubId: string | null;
  clubName: string | null;
  status: RoleAssignmentStatusDTO;
  assignedByUserId: string | null;
  reason: string | null;
  startedAt: string;
  endedAt: string | null;
}
