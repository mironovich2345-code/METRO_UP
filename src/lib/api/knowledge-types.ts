import type { RichDoc } from "@/lib/server/content-schemas";

/** Shared DTOs for the knowledge base (Scripts + Work Instructions). */

export type ContentStatusDTO = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/* -------------------------------- scripts -------------------------------- */

export interface ScriptCategoryDTO {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  isActive: boolean;
  scriptCount?: number;
}

export interface ScriptContentDTO {
  whenToUse: string;
  goal: string;
  keyQuestions: string[];
  script: RichDoc;
  doNotSay: string[];
  nextStep: string;
}

/** Employee-facing script (PUBLISHED only). */
export interface ScriptDetailDTO {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  categoryId: string;
  categoryTitle: string;
  content: ScriptContentDTO;
  updatedAt: string;
}

export interface ScriptListItemDTO {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  categoryId: string;
}

/** Admin-facing script row (any status). */
export interface ScriptAdminRowDTO {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryTitle: string;
  status: ContentStatusDTO;
  order: number;
  updatedAt: string;
}

export interface ScriptAdminDetailDTO extends ScriptAdminRowDTO {
  description: string | null;
  content: ScriptContentDTO;
  publishedAt: string | null;
}

export interface EmployeeScriptsPayload {
  categories: ScriptCategoryDTO[];
  scripts: ScriptListItemDTO[];
}

/* ----------------------------- instructions ------------------------------ */

export type InstructionBlockDTO =
  | { id: string; type: "TEXT"; doc: RichDoc }
  | { id: string; type: "CHECKLIST"; title: string | null; items: { id: string; text: string }[] }
  | { id: string; type: "INFO_CARD"; title: string | null; text: string }
  | { id: string; type: "WARNING"; title: string | null; text: string }
  | { id: string; type: "STEPS"; title: string | null; steps: { id: string; text: string }[] };

export interface InstructionCategoryDTO {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  order: number;
  isActive: boolean;
  instructionCount?: number;
}

export interface InstructionListItemDTO {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  categoryId: string;
}

export interface InstructionDetailDTO {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  categoryId: string;
  categoryTitle: string;
  blocks: InstructionBlockDTO[];
  updatedAt: string;
}

export interface InstructionAdminRowDTO {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryTitle: string;
  status: ContentStatusDTO;
  order: number;
  updatedAt: string;
}

export interface InstructionAdminDetailDTO extends InstructionAdminRowDTO {
  summary: string | null;
  blocks: InstructionBlockDTO[];
  publishedAt: string | null;
}

export interface EmployeeInstructionsPayload {
  categories: InstructionCategoryDTO[];
  instructions: InstructionListItemDTO[];
}

/* -------------------------- user management ------------------------------ */

export type AppRoleDTO = "EMPLOYEE" | "CLUB_MANAGER" | "SPM" | "ADMIN";
export type PositionDTO = "CLIENT_MANAGER" | "NIGHT_MANAGER" | "ADMINISTRATOR";
export type AccessStatusDTO = "LIMITED" | "PENDING_APPROVAL" | "FULL" | "SUSPENDED";

export interface AdminUserRowDTO {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  role: AppRoleDTO;
  cityId: string | null;
  cityName: string | null;
  clubId: string | null;
  clubName: string | null;
  positionId: PositionDTO | null;
  accessStatus: AccessStatusDTO | null;
  hasProfile: boolean;
}

export interface AdminUserDetailDTO extends AdminUserRowDTO {
  telegramFirstName: string | null;
  telegramLastName: string | null;
  createdAt: string;
}

export interface AdminUserFacetsDTO {
  cities: { id: string; name: string }[];
  clubs: { id: string; name: string; cityId: string }[];
}
