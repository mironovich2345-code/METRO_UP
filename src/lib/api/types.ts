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
}

export interface OnboardingInputDTO {
  displayName: string;
  cityId: string;
  clubId: string;
  positionId: PositionDTO;
}
