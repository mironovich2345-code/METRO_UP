/**
 * METRO UP ROUND 1, Milestone 2A — Employee Questions client-facing
 * contract. Plain string-literal unions mirroring the Prisma enums (never
 * `@prisma/client` imported here — client code never imports from
 * `@prisma/client`, matching every other *-types.ts in this codebase, e.g.
 * AccessStatusDTO/PositionDTO in src/lib/api/types.ts). This is the single
 * source of truth for these shapes — questions-core.ts (server) imports
 * EmployeeQuestionDTO/QuestionSenderContextDTO from here rather than
 * defining a parallel copy.
 */

export type QuestionCategoryDTO = "WORK_PROCESSES" | "TRAINING" | "MANAGEMENT" | "WORKING_CONDITIONS" | "TECHNICAL" | "IDEA" | "OTHER";

export type QuestionStatusDTO = "NEW" | "IN_PROGRESS" | "CLOSED";

/** "MANAGER" = this app's NetworkRole for a plain front-line employee, not a
 * management title — same usage as everywhere else NetworkRole=MANAGER
 * appears in this codebase. */
export type QuestionSenderContextDTO = "MANAGER" | "CLUB_MANAGER" | "CITY_MANAGER";

export interface QuestionAttachmentDTO {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Section 3 — anonymity-sanitized. authorDisplay is "Анонимный сотрудник"
 * when the viewer is not entitled to the real identity
 * (questions-core.ts's shouldRevealAuthor) — never a raw telegramId/
 * username/avatar/phone field anywhere on this shape.
 *
 * METRO UP ROUND 1, Milestone 2A.1 — authorUserId is OPTIONAL and, when
 * hidden, genuinely ABSENT from the serialized object (not present with
 * value null or undefined). Check with `'authorUserId' in dto` or
 * `Object.hasOwn(dto, 'authorUserId')` — never `dto.authorUserId == null`,
 * which can't distinguish "hidden" from "field not yet loaded".
 */
export interface EmployeeQuestionDTO {
  id: string;
  category: QuestionCategoryDTO;
  text: string;
  anonymous: boolean;
  status: QuestionStatusDTO;
  authorDisplay: string;
  authorUserId?: string;
  senderRole: QuestionSenderContextDTO;
  cityName: string;
  clubName: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: QuestionAttachmentDTO[];
}

export interface CreateQuestionAttachmentInput {
  storageKey: string;
  originalName: string;
}

export interface CreateQuestionRequestDTO {
  senderContext: QuestionSenderContextDTO;
  category: QuestionCategoryDTO;
  text: string;
  anonymous: boolean;
  attachments: CreateQuestionAttachmentInput[];
  /** METRO UP ROUND 1, Milestone 2B.1, section B — which of the sender's OWN
   * active grants this submission is under, when they hold more than one
   * (e.g. a CLUB_MANAGER/CITY_MANAGER managing several clubs/cities). Never
   * authority by itself — the server only lets it SELECT among candidates
   * it independently derives from the actor's real current grants. */
  scopeHint?: { cityId?: string; clubId?: string };
}

export interface QuestionAttachmentUploadRequestDTO {
  contentType: string;
  sizeBytes: number;
}

export interface QuestionAttachmentUploadTicketDTO {
  uploadUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}
