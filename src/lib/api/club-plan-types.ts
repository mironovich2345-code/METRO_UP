/** Client-safe DTOs for the CLUB_MANAGER control (daily plan + team). Never
 * exposes telegramId/username or other technical identifiers. */

export type EmployeePositionDTO = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";
export type ClubTaskStatusDTO = "TODO" | "COMPLETED" | "SKIPPED";

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
  defaultOrder: number;
  isActive: boolean;
}

export interface ClubPlanTaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: ClubTaskStatusDTO;
  required: boolean;
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
}
