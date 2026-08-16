/**
 * Pure mapping from OpenAI file citations back to Metric source cards (no
 * server-only import → unit testable). The DB lookups live in chat.ts; the
 * access/dedup/assembly decisions live here so they can be tested directly,
 * including the DOCUMENT source type alongside ACADEMY/SCRIPT/INSTRUCTION.
 */
import type { MetricSourceDTO, MetricSourceTypeDTO } from "@/lib/api/metric-types";
import { normalizeScope, type PositionScope } from "./access";
import { isRetrievableSyncStatus } from "./sync-status";

export interface CitationRecord {
  sourceType: string;
  sourceId: string;
  positionScope: string;
  status: string;
}

export interface TitledRow { id: string; title: string; slug: string }

const EMPTY_GROUPS = (): Record<MetricSourceTypeDTO, string[]> =>
  ({ ACADEMY: [], SCRIPT: [], INSTRUCTION: [], DOCUMENT: [] });

/**
 * Keep only citations whose source is SYNCED (retrievable) AND allowed for the
 * position, grouped by source type. A FAILED/PENDING source is never surfaced,
 * and access is re-checked server-side (retrieval scope can't be bypassed).
 */
export function groupAllowedCitations(
  records: CitationRecord[],
  canSee: (scope: PositionScope) => boolean,
): Record<MetricSourceTypeDTO, string[]> {
  const byType = EMPTY_GROUPS();
  for (const r of records) {
    if (!isRetrievableSyncStatus(r.status)) continue;
    if (!canSee(normalizeScope(r.positionScope))) continue;
    const t = r.sourceType as MetricSourceTypeDTO;
    if (byType[t]) byType[t].push(r.sourceId);
  }
  return byType;
}

/**
 * Build the ordered, de-duplicated source-card DTOs from titled rows per type.
 * `href("", "")` returns "" for DOCUMENT (attribution-only, not clickable).
 */
export function assembleSources(
  groups: { sourceType: MetricSourceTypeDTO; rows: TitledRow[] }[],
  href: (t: MetricSourceTypeDTO, slug: string) => string,
  limit = 4,
): MetricSourceDTO[] {
  const out: MetricSourceDTO[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    for (const row of g.rows) {
      const key = `${g.sourceType}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ sourceType: g.sourceType, title: row.title, href: href(g.sourceType, row.slug) });
    }
  }
  return out.slice(0, limit);
}
