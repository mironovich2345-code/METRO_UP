import type { CreateRoleAssignmentBody } from "@/lib/api/roles-client";

/**
 * Sprint: LIVE QA QA-05, part A — the PROJECT_ADMIN «Назначить роль» form as
 * a pure reducer, so the "selected user must stay selected" rule is real,
 * executable logic (tests/qa-05.test.ts) rather than incidental component
 * state. One model for every viewport — the mobile and desktop layouts render
 * the same state and submit through the same rolesApi.create.
 *
 * The ONLY transitions that clear the chosen user are: the admin pressing
 * «Изменить» (USER_CLEARED) and a successful assignment (SUBMIT_SUCCEEDED —
 * the product closes the form). Role, scope, city, club, comment, search
 * results arriving, a failed submit — none of them touch `selectedUser`.
 *
 * Roles a PROJECT_ADMIN may assign here are unchanged (canAssignRole):
 * CITY_MANAGER (city or single-club scope) and OPERATIONS_DIRECTOR (network).
 */

export type AssignableRole = "CITY_MANAGER" | "OPERATIONS_DIRECTOR";
export type CityManagerScope = "CITY" | "CLUB";

export interface SelectedRoleUser {
  id: string;
  displayName: string;
  clubName: string | null;
}

export interface RoleAssignmentFormState {
  query: string;
  selectedUser: SelectedRoleUser | null;
  role: AssignableRole;
  scopeType: CityManagerScope;
  cityId: string;
  clubId: string;
  reason: string;
  submitting: boolean;
  error: string | null;
}

export const INITIAL_ROLE_ASSIGNMENT_FORM: RoleAssignmentFormState = {
  query: "",
  selectedUser: null,
  role: "CITY_MANAGER",
  scopeType: "CITY",
  cityId: "",
  clubId: "",
  reason: "",
  submitting: false,
  error: null,
};

export type RoleAssignmentFormAction =
  | { type: "QUERY_CHANGED"; query: string }
  | { type: "USER_SELECTED"; user: SelectedRoleUser }
  | { type: "USER_CLEARED" }
  | { type: "ROLE_CHANGED"; role: AssignableRole }
  | { type: "SCOPE_TYPE_CHANGED"; scopeType: CityManagerScope }
  | { type: "CITY_CHANGED"; cityId: string }
  | { type: "CLUB_CHANGED"; clubId: string }
  | { type: "REASON_CHANGED"; reason: string }
  | { type: "SUBMIT_STARTED" }
  | { type: "SUBMIT_FAILED"; error: string }
  | { type: "SUBMIT_SUCCEEDED" }
  | { type: "VALIDATION_FAILED"; error: string };

export function roleAssignmentFormReducer(state: RoleAssignmentFormState, action: RoleAssignmentFormAction): RoleAssignmentFormState {
  switch (action.type) {
    case "QUERY_CHANGED":
      return { ...state, query: action.query };
    case "USER_SELECTED":
      return { ...state, selectedUser: action.user, query: "", error: null };
    case "USER_CLEARED":
      return { ...state, selectedUser: null, error: null };
    case "ROLE_CHANGED":
      return { ...state, role: action.role, error: null };
    case "SCOPE_TYPE_CHANGED":
      return { ...state, scopeType: action.scopeType, error: null };
    case "CITY_CHANGED":
      return { ...state, cityId: action.cityId, error: null };
    case "CLUB_CHANGED":
      return { ...state, clubId: action.clubId, error: null };
    case "REASON_CHANGED":
      return { ...state, reason: action.reason };
    case "VALIDATION_FAILED":
      return { ...state, error: action.error };
    case "SUBMIT_STARTED":
      return { ...state, submitting: true, error: null };
    // A failed request keeps EVERY value the admin entered, the user included.
    case "SUBMIT_FAILED":
      return { ...state, submitting: false, error: action.error };
    // The intended post-success state: a fresh form (the modal also closes).
    case "SUBMIT_SUCCEEDED":
      return INITIAL_ROLE_ASSIGNMENT_FORM;
    default:
      return state;
  }
}

/** The request the form sends, or why it can't be sent yet. Same shapes as
 * before this round (OPERATIONS_DIRECTOR -> NETWORK; CITY_MANAGER -> CITY or
 * CLUB); now also refuses an empty city/club instead of posting "" and
 * getting a generic server error back. */
export function buildRoleAssignmentRequest(
  state: RoleAssignmentFormState,
): { ok: true; body: CreateRoleAssignmentBody } | { ok: false; error: string } {
  if (!state.selectedUser) return { ok: false, error: "Выберите пользователя." };
  const reason = state.reason.trim() || undefined;
  if (state.role === "OPERATIONS_DIRECTOR") {
    return { ok: true, body: { userId: state.selectedUser.id, role: "OPERATIONS_DIRECTOR", scopeType: "NETWORK", reason } };
  }
  if (state.scopeType === "CITY") {
    if (!state.cityId) return { ok: false, error: "Выберите город." };
    return { ok: true, body: { userId: state.selectedUser.id, role: "CITY_MANAGER", scopeType: "CITY", cityId: state.cityId, reason } };
  }
  if (!state.clubId) return { ok: false, error: "Выберите клуб." };
  return { ok: true, body: { userId: state.selectedUser.id, role: "CITY_MANAGER", scopeType: "CLUB", clubId: state.clubId, reason } };
}

/** Server error code -> what the form shows (the form stays filled in). */
export function describeRoleAssignmentCreateError(code: string | null): string {
  switch (code) {
    case "assignment_already_active":
    case "duplicate_active_assignment":
      return "Такое назначение уже активно.";
    case "operations_director_limit_reached":
      return "Достигнут лимит активных операционных директоров.";
    case "forbidden":
      return "Недостаточно прав для этого назначения.";
    case "user_not_found":
      return "Пользователь не найден.";
    case "city_not_found":
      return "Город не найден.";
    case "club_not_found":
      return "Клуб не найден.";
    default:
      return "Не удалось создать назначение. Попробуйте ещё раз.";
  }
}
