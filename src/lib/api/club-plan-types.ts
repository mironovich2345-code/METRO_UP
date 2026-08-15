/** Client-safe DTOs for the CLUB_MANAGER control (daily plan + team). Never
 * exposes telegramId/username or other technical identifiers. */

export type EmployeePositionDTO = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";
export type ClubTaskStatusDTO = "TODO" | "COMPLETED" | "SKIPPED";
export type TaskPriorityDTO = "NORMAL" | "HIGH";

export interface ChecklistItemDefDTO {
  id: string;
  text: string;
  required: boolean;
  order: number;
}
export interface ChecklistItemStateDTO extends ChecklistItemDefDTO {
  done: boolean;
}

/**
 * Club scope for the control panel. `canSwitch` is true only for ADMIN (who may
 * pick any club); CLUB_MANAGER is locked to their own club and gets no list.
 */
export interface ManagerScopeDTO {
  clubId: string | null;
  clubName: string | null;
  canSwitch: boolean;
  clubs: { id: string; name: string; cityName: string | null }[];
}

/** One-off assignment target chosen by the manager. */
export type ClubTaskTarget =
  | { type: "USER"; userId: string }
  | { type: "POSITION"; position: "CLIENT_MANAGER" | "NIGHT_MANAGER" }
  | { type: "ALL_MANAGERS" };

export interface ClubTaskTemplateDTO {
  id: string;
  title: string;
  description: string | null;
  targetPosition: EmployeePositionDTO | null; // null = all managers
  required: boolean;
  priority: TaskPriorityDTO;
  timeHint: string | null;
  checklist: ChecklistItemDefDTO[];
  defaultOrder: number;
  isActive: boolean;
  /** True for a provisioned production default (has a stable code). */
  isDefault: boolean;
}

export interface ClubPlanTaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: ClubTaskStatusDTO;
  required: boolean;
  priority: TaskPriorityDTO;
  timeHint: string | null;
  checklist: ChecklistItemStateDTO[];
  /** True for manager-created tasks (one-off/template); system tasks are false. */
  isManager: boolean;
  /** True only for one-off manager tasks the manager may delete. */
  canDelete: boolean;
}

export interface ClubPlanEmployeeDTO {
  userId: string;
  displayName: string;
  positionTitle: string | null;
  completed: number;
  total: number;
  hasHighUnfinished: boolean;
  tasks: ClubPlanTaskDTO[];
}

export interface ClubPlanDTO {
  date: string;
  clubId: string | null;
  clubName: string | null;
  totalEmployees: number;
  employeesCompleted: number;
  tasksTotal: number;
  tasksCompleted: number;
  employees: ClubPlanEmployeeDTO[];
  templates: ClubTaskTemplateDTO[];
  /** Read-only SYSTEM tasks (managed by METRO UP) for the CLIENT_MANAGER plan. */
  systemTasks: { title: string }[];
  /** Active club scope + (for ADMIN) the switchable club list. */
  scope: ManagerScopeDTO;
}

export interface TeamMemberDTO {
  userId: string;
  displayName: string;
  positionTitle: string | null;
  planCompleted: number;
  planTotal: number;
  lessonsCompleted: number;
}
export interface ClubTeamDTO {
  clubId: string | null;
  clubName: string | null;
  members: TeamMemberDTO[];
  scope: ManagerScopeDTO;
}
