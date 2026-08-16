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

interface IngestResult {
  storageKey: string; extractedText: string; mimeType: string; fileSize: number; originalFileName: string;
  timing: { extractMs: number; uploadMs: number };
}

/** Validate + extract + store the original in R2. Returns fields for create/replace. */
async function ingestFile(file: DocFileInput): Promise<IngestResult> {
  const fmt = detectFormat(file.mimeType, file.filename);
  if (!fmt) throw new AuthError(400, "unsupported_format", "Поддерживаются PDF, DOCX, TXT, MD");
  if (file.buffer.length === 0) throw new AuthError(400, "empty_file", "Файл пуст");
  if (file.buffer.length > DOC_MAX_BYTES) throw new AuthError(400, "file_too_large", "Файл больше 20 МБ");

  // Stage 1 — text extraction (CPU-bound; now bounded so it can't block the loop).
  const tExtract = Date.now();
  const extract = extractDocumentText(file.mimeType, file.filename, file.buffer);
  const extractMs = Date.now() - tExtract;
  if (!extract.ok) {
    // Safe diagnostics — format + size only, never filename/content/PII.
    console.warn(`[metric-doc] extract_failed {format:"${fmt}", bytes:${file.buffer.length}, extractMs:${extractMs}, reason:"${extract.reason}"}`);
    if (extract.reason === "no_text") {
      throw new AuthError(400, "no_extractable_text", "В документе не найден текст. Для сканированных документов OCR пока не поддерживается.");
    }
    throw new AuthError(400, extract.reason === "empty" ? "empty_file" : "unsupported_format");
  }

  // Stage 2 — upload the original to object storage (R2).
  const safeName = sanitizeFilename(file.filename);
  const storageKey = `metric-documents/${randomUUID()}/${safeName}`;
  const storage = getStorageProvider();
  const tUpload = Date.now();
  const signed = await storage.createSignedUploadUrl({ storageKey, contentType: file.mimeType });
  const put = await fetch(signed.uploadUrl, { method: "PUT", headers: signed.requiredHeaders, body: new Uint8Array(file.buffer) });
  if (!put.ok) throw new AuthError(502, "storage_error", "Не удалось загрузить файл");
  const uploadMs = Date.now() - tUpload;

  return {
    storageKey, extractedText: extract.text, mimeType: file.mimeType, fileSize: file.buffer.length,
    originalFileName: safeName, timing: { extractMs, uploadMs },
  };
}

/** Safe per-stage timing line — no filename, no content, no PII. */
function logUploadTiming(op: string, fmt: string, bytes: number, t: { extractMs: number; uploadMs: number }, dbMs: number, totalMs: number) {
  console.info(`[metric-doc] upload timing {op:"${op}", format:"${fmt}", bytes:${bytes}, extractMs:${t.extractMs}, uploadMs:${t.uploadMs}, dbMs:${dbMs}, totalMs:${totalMs}}`);
}

function assertEditable(status: string) {
  if (status === "PUBLISHED") throw new AuthError(409, "document_published_readonly", "Сначала верните документ в черновик");
}

/* -------------------------------- create -------------------------------- */

export async function createDocument(actorUserId: string, meta: DocMetaInput, file: DocFileInput): Promise<MetricDocumentDetailDTO> {
  const t0 = Date.now();
  const { timing, ...ingested } = await ingestFile(file);
  const tDb = Date.now();
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
  logUploadTiming("create", detectFormat(file.mimeType, file.filename) ?? "?", ingested.fileSize, timing, Date.now() - tDb, Date.now() - t0);
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
  const t0 = Date.now();
  const { timing, ...ingested } = await ingestFile(file);
  // Best-effort cleanup of the previous object.
  getStorageProvider().deleteObject(existing.storageKey).catch(() => {});
  const tDb = Date.now();
  const doc = await prisma.metricKnowledgeDocument.update({ where: { id }, data: { ...ingested, updatedByUserId: actorUserId } });
  await writeAudit(prisma, { actorUserId, entityType: "MetricDocument", entityId: id, action: "UPDATE", metadata: { op: "REPLACE_FILE" } });
  logUploadTiming("replace", detectFormat(file.mimeType, file.filename) ?? "?", ingested.fileSize, timing, Date.now() - tDb, Date.now() - t0);
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
