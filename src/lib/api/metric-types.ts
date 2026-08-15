/** Client-safe Metric AI DTOs. No secrets, no telegram ids, no other users. */

export type MetricSourceTypeDTO = "ACADEMY" | "SCRIPT" | "INSTRUCTION" | "DOCUMENT";
export type MetricRoleDTO = "USER" | "ASSISTANT";

export interface MetricSourceDTO {
  sourceType: MetricSourceTypeDTO;
  title: string;
  href: string;
}

export interface MetricMessageDTO {
  id: string;
  role: MetricRoleDTO;
  content: string;
  sources: MetricSourceDTO[];
  /** True when the answer was cut off by the output-token limit (→ «Продолжить»). */
  isTruncated: boolean;
  createdAt: string;
}

export interface MetricConversationDTO {
  conversationId: string | null;
  messages: MetricMessageDTO[];
  /** false when the feature flag is off or config is incomplete. */
  ready: boolean;
}

export interface MetricChatResultDTO {
  conversationId: string;
  message: MetricMessageDTO;
}

/* ------------------------------ admin status ----------------------------- */

export interface MetricSyncCountsDTO {
  synced: number;
  pending: number;
  failed: number;
}
export interface MetricStatusDTO {
  ready: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  hasVectorStore: boolean;
  model: string;
  bySource: Record<MetricSourceTypeDTO, MetricSyncCountsDTO>;
  totals: MetricSyncCountsDTO;
}

/* ---------------------------- documents (ADMIN) -------------------------- */

export type MetricDocCategoryDTO =
  | "TRAINING_MANUAL" | "CLUB_RULES" | "WORK_REGULATION" | "CONTRACT_TEMPLATE"
  | "SALES_MATERIAL" | "FINANCE_CASH" | "REFUNDS" | "HR" | "OTHER";
export type ContentStatusDTO = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type DocScopeDTO = "ALL" | "SALES";

export interface MetricDocumentRowDTO {
  id: string;
  title: string;
  category: MetricDocCategoryDTO;
  status: ContentStatusDTO;
  positionScope: DocScopeDTO;
  originalFileName: string;
  fileSize: number;
  versionLabel: string | null;
  updatedAt: string;
}
export interface MetricDocumentDetailDTO extends MetricDocumentRowDTO {
  description: string | null;
  mimeType: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
}
export interface MetricDocumentsPayload {
  documents: MetricDocumentRowDTO[];
  counts: MetricSyncCountsDTO & { total: number };
}

/* --------------------------- documents (employee) ----------------------- */

export interface EmployeeDocumentDTO {
  id: string;
  title: string;
  description: string | null;
  category: MetricDocCategoryDTO;
  categoryLabel: string;
  versionLabel: string | null;
  effectiveFrom: string | null;
  updatedAt: string;
  text: string;
}
