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
}

export interface OnboardingInputDTO {
  displayName: string;
  cityId: string;
  clubId: string;
  positionId: PositionDTO;
}
