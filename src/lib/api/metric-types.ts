/** Client-safe Metric AI DTOs. No secrets, no telegram ids, no other users. */

export type MetricSourceTypeDTO = "ACADEMY" | "SCRIPT" | "INSTRUCTION";
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
