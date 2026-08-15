import "server-only";
import type { EmployeePosition } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import { normalizeScope, positionAllows } from "./access";
import { DOC_CATEGORY_LABEL } from "@/lib/metric-doc-meta";
import type { EmployeeDocumentDTO, MetricDocCategoryDTO } from "@/lib/api/metric-types";

/**
 * Employee-facing document read. Returns a PUBLISHED document only, and only if
 * the employee's position is allowed by its scope. Renders the extracted text
 * (never the binary) — a safe in-app view, not a Control URL.
 */
export async function getEmployeeDocument(id: string, position: EmployeePosition | null): Promise<EmployeeDocumentDTO> {
  const d = await prisma.metricKnowledgeDocument.findFirst({ where: { id, status: "PUBLISHED" } });
  if (!d) throw new AuthError(404, "document_not_found");
  if (!positionAllows(position, normalizeScope(d.positionScope))) throw new AuthError(403, "forbidden");
  const category = d.category as MetricDocCategoryDTO;
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    category,
    categoryLabel: DOC_CATEGORY_LABEL[category] ?? category,
    versionLabel: d.versionLabel,
    effectiveFrom: d.effectiveFrom?.toISOString() ?? null,
    updatedAt: d.updatedAt.toISOString(),
    text: d.extractedText,
  };
}
