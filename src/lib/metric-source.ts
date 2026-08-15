import type { MetricSourceTypeDTO } from "@/lib/api/metric-types";

/**
 * Metric source cards: Academy/Script/Instruction open the employee-facing item;
 * DOCUMENT is an informational attribution only — employees do not read the raw
 * extracted document text, so its card is not clickable (no href, no chevron).
 */
export function isClickableSource(sourceType: MetricSourceTypeDTO): boolean {
  return sourceType !== "DOCUMENT";
}
