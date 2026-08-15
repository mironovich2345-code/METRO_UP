import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, MetricDocCategory } from "@prisma/client";
import { prisma } from "../db";
import { AuthError } from "../authz";
import { writeAudit } from "../audit";
import { getStorageProvider } from "@/lib/storage/provider";
import { extractDocumentText, detectFormat, sanitizeFilename, DOC_MAX_BYTES } from "./document-text";
import { normalizeScope, type PositionScope } from "./access";
import { onKnowledgeChanged } from "./knowledge-sync";
import type {
  MetricDocumentRowDTO, MetricDocumentDetailDTO, MetricDocumentsPayload,
  MetricDocCategoryDTO, DocScopeDTO,
} from "@/lib/api/metric-types";
export { DOC_CATEGORY_LABEL } from "@/lib/metric-doc-meta";

/**
 * ADMIN CRUD for Metric corporate documents. The original binary is stored in
 * object storage (R2); the extracted text is stored in the DB and is what gets
 * indexed. All writes are audited. OpenAI sync happens after the DB commit
 * (onKnowledgeChanged) — a sync failure never rolls back the published document.
 */

export interface DocMetaInput {
  title: string;
  category: MetricDocCategoryDTO;
  description?: string | null;
  positionScope: DocScopeDTO;
  versionLabel?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}
export interface DocFileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

function toRow(d: {
  id: string; title: string; category: string; status: string; positionScope: string;
  originalFileName: string; fileSize: number; versionLabel: string | null; updatedAt: Date;
}): MetricDocumentRowDTO {
  return {
    id: d.id, title: d.title, category: d.category as MetricDocCategoryDTO,
    status: d.status as MetricDocumentRowDTO["status"], positionScope: (d.positionScope === "SALES" ? "SALES" : "ALL"),
    originalFileName: d.originalFileName, fileSize: d.fileSize, versionLabel: d.versionLabel,
    updatedAt: d.updatedAt.toISOString(),
  };
}
function toDetail(d: {
  id: string; title: string; category: string; status: string; positionScope: string;
  originalFileName: string; fileSize: number; versionLabel: string | null; updatedAt: Date;
  description: string | null; mimeType: string; effectiveFrom: Date | null; effectiveTo: Date | null; publishedAt: Date | null;
}): MetricDocumentDetailDTO {
  return {
    ...toRow(d),
    description: d.description, mimeType: d.mimeType,
    effectiveFrom: d.effectiveFrom?.toISOString() ?? null,
    effectiveTo: d.effectiveTo?.toISOString() ?? null,
    publishedAt: d.publishedAt?.toISOString() ?? null,
  };
}

/** Validate + extract + store the original in R2. Returns fields for create/replace. */
async function ingestFile(file: DocFileInput): Promise<{ storageKey: string; extractedText: string; mimeType: string; fileSize: number; originalFileName: string }> {
  if (!detectFormat(file.mimeType, file.filename)) throw new AuthError(400, "unsupported_format", "Поддерживаются PDF, DOCX, TXT, MD");
  if (file.buffer.length === 0) throw new AuthError(400, "empty_file", "Файл пуст");
  if (file.buffer.length > DOC_MAX_BYTES) throw new AuthError(400, "file_too_large", "Файл больше 20 МБ");

  const extract = extractDocumentText(file.mimeType, file.filename, file.buffer);
  if (!extract.ok) {
    if (extract.reason === "no_text") {
      throw new AuthError(400, "no_extractable_text", "В документе не найден текст. Для сканированных документов OCR пока не поддерживается.");
    }
    throw new AuthError(400, extract.reason === "empty" ? "empty_file" : "unsupported_format");
  }

  const safeName = sanitizeFilename(file.filename);
  const storageKey = `metric-documents/${randomUUID()}/${safeName}`;
  const storage = getStorageProvider();
  const signed = await storage.createSignedUploadUrl({ storageKey, contentType: file.mimeType });
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.requiredHeaders, body: new Uint8Array(file.buffer) });
  if (!put.ok) throw new AuthError(502, "storage_error", "Не удалось загрузить файл");

  return { storageKey, extractedText: extract.text, mimeType: file.mimeType, fileSize: file.buffer.length, originalFileName: safeName };
}

function assertEditable(status: string) {
  if (status === "PUBLISHED") throw new AuthError(409, "document_published_readonly", "Сначала верните документ в черновик");
}

/* -------------------------------- create -------------------------------- */

export async function createDocument(actorUserId: string, meta: DocMetaInput, file: DocFileInput): Promise<MetricDocumentDetailDTO> {
  const ingested = await ingestFile(file);
  const doc = await prisma.metricKnowledgeDocument.create({
    data: {
      title: meta.title,
      category: meta.category as MetricDocCategory,
      description: meta.description ?? null,
      positionScope: normalizeScope(meta.positionScope),
      versionLabel: meta.versionLabel ?? null,
      effectiveFrom: meta.effectiveFrom ? new Date(meta.effectiveFrom) : null,
      effectiveTo: meta.effectiveTo ? new Date(meta.effectiveTo) : null,
      ...ingested,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: doc.id, action: "CREATE" });
  return toDetail(doc);
}

/* ----------------------------- update / file ---------------------------- */

export async function updateDocumentMeta(actorUserId: string, id: string, meta: Partial<DocMetaInput>): Promise<MetricDocumentDetailDTO> {
  const existing = await prisma.metricKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "document_not_found");
  assertEditable(existing.status);
  const data: Prisma.MetricKnowledgeDocumentUpdateInput = { updatedByUserId: actorUserId };
  if (meta.title !== undefined) data.title = meta.title;
  if (meta.category !== undefined) data.category = meta.category as MetricDocCategory;
  if (meta.description !== undefined) data.description = meta.description ?? null;
  if (meta.positionScope !== undefined) data.positionScope = normalizeScope(meta.positionScope);
  if (meta.versionLabel !== undefined) data.versionLabel = meta.versionLabel ?? null;
  if (meta.effectiveFrom !== undefined) data.effectiveFrom = meta.effectiveFrom ? new Date(meta.effectiveFrom) : null;
  if (meta.effectiveTo !== undefined) data.effectiveTo = meta.effectiveTo ? new Date(meta.effectiveTo) : null;
  const doc = await prisma.metricKnowledgeDocument.update({ where: { id }, data });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: id, action: "UPDATE" });
  return toDetail(doc);
}

export async function replaceDocumentFile(actorUserId: string, id: string, file: DocFileInput): Promise<MetricDocumentDetailDTO> {
  const existing = await prisma.metricKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "document_not_found");
  assertEditable(existing.status);
  const ingested = await ingestFile(file);
  // Best-effort cleanup of the previous object.
  getStorageProvider().deleteObject(existing.storageKey).catch(() => {});
  const doc = await prisma.metricKnowledgeDocument.update({ where: { id }, data: { ...ingested, updatedByUserId: actorUserId } });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: id, action: "UPDATE", metadata: { op: "REPLACE_FILE" } });
  return toDetail(doc);
}

/* --------------------------- publish / status --------------------------- */

export async function publishDocument(actorUserId: string, id: string): Promise<MetricDocumentDetailDTO> {
  const existing = await prisma.metricKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "document_not_found");
  const doc = await prisma.metricKnowledgeDocument.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: existing.publishedAt ?? new Date(), updatedByUserId: actorUserId },
  });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: id, action: "PUBLISH" });
  onKnowledgeChanged("DOCUMENT", id);
  return toDetail(doc);
}

export async function setDocumentStatus(actorUserId: string, id: string, status: "DRAFT" | "ARCHIVED"): Promise<MetricDocumentDetailDTO> {
  const existing = await prisma.metricKnowledgeDocument.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "document_not_found");
  const doc = await prisma.metricKnowledgeDocument.update({ where: { id }, data: { status, updatedByUserId: actorUserId } });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: id, action: status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH" });
  onKnowledgeChanged("DOCUMENT", id); // no longer PUBLISHED → removed from retrieval
  return toDetail(doc);
}

/* ------------------------------- reads ---------------------------------- */

export async function listDocuments(): Promise<MetricDocumentsPayload> {
  const rows = await prisma.metricKnowledgeDocument.findMany({ orderBy: [{ updatedAt: "desc" }] });
  const counts = { synced: 0, pending: 0, failed: 0, total: rows.length };
  return { documents: rows.map(toRow), counts };
}

export async function getDocument(id: string): Promise<MetricDocumentDetailDTO> {
  const d = await prisma.metricKnowledgeDocument.findUnique({ where: { id } });
  if (!d) throw new AuthError(404, "document_not_found");
  return toDetail(d);
}

/** Short-lived signed URL for ADMIN to download the original file. */
export async function getDocumentDownloadUrl(id: string): Promise<string> {
  const d = await prisma.metricKnowledgeDocument.findUnique({ where: { id }, select: { storageKey: true } });
  if (!d) throw new AuthError(404, "document_not_found");
  return getStorageProvider().createSignedDownloadUrl(d.storageKey, 300);
}

export type { PositionScope };
