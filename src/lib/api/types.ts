/** Client-safe user shape returned by the auth API (mirrors server `meDTO`). */

export type AppRoleDTO = "EMPLOYEE" | "CLUB_MANAGER" | "SPM" | "ADMIN";
export type PositionDTO = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";
export type CareerLevelDTO =
  | "NEWCOMER"
  | "MANAGER"
  | "TOP_MANAGER"
  | "LEADER"
  | "MANAGER_PRO";
export type AccessStatusDTO =
  | "LIMITED"
  | "PENDING_APPROVAL"
  | "FULL"
  | "SUSPENDED";

export type ViewAsRoleDTO = "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";

/** Sprint 1 / Phase 2D — present only when GET /api/auth/me was served
 * during an active View As preview (control/(portal)'s ViewAsBanner uses
 * the same shape, driven server-side by resolveViewContext there; this is
 * the Mini-App-side twin so the same banner can render on /home etc). */
export interface ViewContextDTO {
  previewRole: ViewAsRoleDTO;
  realRoleLabel: string;
  /** Sprint: manual-test-round-2, section 3 — "club scope visible" during a
   * preview. Set only for a CLUB_MANAGER/MANAGER preview (always club-scoped);
   * null for a CITY_MANAGER self-preview (no single club to name). */
  scopeLabel?: string | null;
}

export interface AppUserDTO {
  displayName: string;
  role: AppRoleDTO;
  telegram: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
  };
  /** Custom uploaded avatar (METRO UP ROUND 1, Milestone 1), or null — never
   * falls back to telegram.photoUrl above; the client shows initials when
   * this is null. */
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  profile: null | {
    cityId: string;
    clubId: string;
    positionId: PositionDTO;
    careerLevel: CareerLevelDTO;
    accessStatus: AccessStatusDTO;
  };
  /** Non-null only while previewing (see ViewContextDTO). Absent/null under
   * normal (non-preview) use. */
  viewContext?: ViewContextDTO | null;
  /**
   * Sprint: REMEDIATION R3, F-06 — legacy AppRole=ADMIN OR an active
   * PROJECT_ADMIN/SYSTEM RoleAssignment grant (the exact same
   * hasSystemAccess/hasSystemAccessForUser primitive /admin's own layout
   * and every /api/admin route already gate on — never re-derived
   * client-side). ALWAYS the REAL actor's own authority, even while a
   * View-As MANAGER/CLUB_MANAGER preview is active and every OTHER field
   * on this DTO reflects the synthetic persona: Profile displays the real
   * user's identity/roles and is deliberately NOT persona-substituted —
   * View As must never widen or hide the real actor's own system access.
   */
  hasSystemAccess: boolean;
}

export interface OnboardingInputDTO {
  displayName: string;
  cityId: string;
  clubId: string;
  positionId: PositionDTO;
}
