import "server-only";
import { prisma } from "../db";
import { toLessonBlockDTOs } from "../content";
import { scriptContentSchema, instructionBlocksSchema, normalizeBlocks } from "../knowledge-schemas";
import type { ScriptDetailDTO, InstructionDetailDTO, InstructionBlockDTO } from "@/lib/api/knowledge-types";
import { normalizeScope, type MetricSourceType } from "./access";
import type { MetricStatusDTO, MetricSyncCountsDTO, MetricSourceTypeDTO } from "@/lib/api/metric-types";
import { buildScriptDoc, buildInstructionDoc, buildLessonDoc, buildDocumentDoc, type KnowledgeDoc } from "./documents";
import { httpTransport, type MetricTransport, MetricOpenAiError } from "./openai";
import { getMetricEnv, isMetricReady } from "./env";

/**
 * Knowledge → OpenAI vector-store sync. Idempotent: re-syncing a source replaces
 * its file. OpenAI is NEVER inside a DB transaction — a network failure leaves
 * the content published and the sync record PENDING/FAILED for a safe retry.
 */
export interface SyncDeps {
  transport: MetricTransport;
  vectorStoreId: string;
}

function safeError(e: unknown): string {
  if (e instanceof MetricOpenAiError) return e.message;
  if (e instanceof Error) return e.name;
  return "sync_error";
}

/* ------------------------- published source → doc ------------------------ */

async function loadDoc(sourceType: MetricSourceType, sourceId: string): Promise<{ doc: KnowledgeDoc; updatedAt: Date } | null> {
  if (sourceType === "SCRIPT") {
    const s = await prisma.script.findFirst({ where: { id: sourceId, status: "PUBLISHED", category: { isActive: true } }, include: { category: true } });
    if (!s) return null;
    const content = scriptContentSchema.parse(s.content);
    const dto: ScriptDetailDTO = {
      id: s.id, title: s.title, slug: s.slug, description: s.description,
      categoryId: s.categoryId, categoryTitle: s.category.title,
      content: content as ScriptDetailDTO["content"], updatedAt: s.updatedAt.toISOString(),
    };
    return { doc: buildScriptDoc(dto, s.updatedAt.toISOString()), updatedAt: s.updatedAt };
  }
  if (sourceType === "INSTRUCTION") {
    const w = await prisma.workInstruction.findFirst({ where: { id: sourceId, status: "PUBLISHED", category: { isActive: true } }, include: { category: true } });
    if (!w) return null;
    const parsed = instructionBlocksSchema.safeParse(w.blocks);
    const blocks = normalizeBlocks(parsed.success ? parsed.data : []) as InstructionBlockDTO[];
    const dto: InstructionDetailDTO = {
      id: w.id, title: w.title, slug: w.slug, summary: w.summary,
      categoryId: w.categoryId, categoryTitle: w.category.title, blocks, updatedAt: w.updatedAt.toISOString(),
    };
    return { doc: buildInstructionDoc(dto, w.updatedAt.toISOString()), updatedAt: w.updatedAt };
  }
  if (sourceType === "DOCUMENT") {
    const d = await prisma.metricKnowledgeDocument.findFirst({ where: { id: sourceId, status: "PUBLISHED" } });
    if (!d) return null;
    return {
      doc: buildDocumentDoc({
        id: d.id, title: d.title, description: d.description, category: d.category,
        extractedText: d.extractedText, positionScope: normalizeScope(d.positionScope),
        versionLabel: d.versionLabel, updatedAt: d.updatedAt.toISOString(),
      }),
      updatedAt: d.updatedAt,
    };
  }
  // ACADEMY
  const l = await prisma.lesson.findFirst({ where: { id: sourceId, status: "PUBLISHED" }, include: { blocks: { orderBy: { order: "asc" } } } });
  if (!l) return null;
  const blocks = await toLessonBlockDTOs(l.blocks);
  return {
    doc: buildLessonDoc({ id: l.id, title: l.title, slug: l.slug, shortDescription: l.shortDescription, blocks, updatedAt: l.updatedAt.toISOString() }),
    updatedAt: l.updatedAt,
  };
}

/* ------------------------------ sync one --------------------------------- */

export async function syncSource(sourceType: MetricSourceType, sourceId: string, deps: SyncDeps): Promise<void> {
  const loaded = await loadDoc(sourceType, sourceId);
  if (!loaded) {
    await removeSource(sourceType, sourceId, deps);
    return;
  }
  const { doc, updatedAt } = loaded;
  const existing = await prisma.knowledgeSyncRecord.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId } } });
  await prisma.knowledgeSyncRecord.upsert({
    where: { sourceType_sourceId: { sourceType, sourceId } },
    update: { status: "PENDING", sourceUpdatedAt: updatedAt, positionScope: doc.positionScope, lastErrorSafe: null },
    create: { sourceType, sourceId, status: "PENDING", sourceUpdatedAt: updatedAt, positionScope: doc.positionScope },
  });
  try {
    const { fileId } = await deps.transport.uploadKnowledgeFile(doc.filename, doc.content);
    const { vectorStoreFileId } = await deps.transport.attachToVectorStore(deps.vectorStoreId, fileId, doc.attributes);
    // Replace the previous file (best-effort; never blocks the new one).
    if (existing?.vectorStoreFileId && existing.openaiFileId) {
      await deps.transport.removeFromVectorStore(deps.vectorStoreId, existing.openaiFileId).catch(() => {});
      await deps.transport.deleteFile(existing.openaiFileId).catch(() => {});
    }
    await prisma.knowledgeSyncRecord.update({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      data: { status: "SYNCED", openaiFileId: fileId, vectorStoreFileId, syncedAt: new Date(), lastErrorSafe: null },
    });
  } catch (e) {
    await prisma.knowledgeSyncRecord.update({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      data: { status: "FAILED", lastErrorSafe: safeError(e) },
    });
  }
}

/* ------------------------------ remove one ------------------------------- */

export async function removeSource(sourceType: MetricSourceType, sourceId: string, deps: SyncDeps): Promise<void> {
  const rec = await prisma.knowledgeSyncRecord.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId } } });
  if (!rec) return;
  try {
    if (rec.openaiFileId) {
      await deps.transport.removeFromVectorStore(deps.vectorStoreId, rec.openaiFileId);
      await deps.transport.deleteFile(rec.openaiFileId);
    }
    await prisma.knowledgeSyncRecord.delete({ where: { id: rec.id } });
  } catch (e) {
    await prisma.knowledgeSyncRecord.update({ where: { id: rec.id }, data: { status: "FAILED", lastErrorSafe: safeError(e) } });
  }
}

/* ------------------------------ full sync -------------------------------- */

async function publishedIds(): Promise<Record<MetricSourceType, string[]>> {
  const [scripts, instructions, lessons, documents] = await Promise.all([
    prisma.script.findMany({ where: { status: "PUBLISHED", category: { isActive: true } }, select: { id: true } }),
    prisma.workInstruction.findMany({ where: { status: "PUBLISHED", category: { isActive: true } }, select: { id: true } }),
    prisma.lesson.findMany({ where: { status: "PUBLISHED" }, select: { id: true } }),
    prisma.metricKnowledgeDocument.findMany({ where: { status: "PUBLISHED" }, select: { id: true } }),
  ]);
  return {
    SCRIPT: scripts.map((x) => x.id),
    INSTRUCTION: instructions.map((x) => x.id),
    ACADEMY: lessons.map((x) => x.id),
    DOCUMENT: documents.map((x) => x.id),
  };
}

const SOURCE_TYPES: MetricSourceType[] = ["SCRIPT", "INSTRUCTION", "ACADEMY", "DOCUMENT"];

export async function fullSync(deps: SyncDeps): Promise<{ synced: number; removed: number }> {
  const ids = await publishedIds();
  let synced = 0;
  let removed = 0;
  for (const sourceType of SOURCE_TYPES) {
    for (const id of ids[sourceType]) {
      await syncSource(sourceType, id, deps);
      synced += 1;
    }
  }
  // Remove records whose source is no longer published.
  const records = await prisma.knowledgeSyncRecord.findMany({ select: { sourceType: true, sourceId: true } });
  const publishedSet = new Set(
    SOURCE_TYPES.flatMap((t) => ids[t].map((id) => `${t}:${id}`)),
  );
  for (const r of records) {
    if (!publishedSet.has(`${r.sourceType as MetricSourceType}:${r.sourceId}`)) {
      await removeSource(r.sourceType as MetricSourceType, r.sourceId, deps);
      removed += 1;
    }
  }
  return { synced, removed };
}

/* -------------------------- hooks + status ------------------------------- */

/** Fire-and-forget re-sync after a publish/archive DB commit. Never throws. */
export function onKnowledgeChanged(sourceType: MetricSourceType, sourceId: string): void {
  const env = getMetricEnv();
  if (!env.apiKey || !env.vectorStoreId) return; // nothing to sync to yet
  const deps: SyncDeps = { transport: httpTransport(env.apiKey), vectorStoreId: env.vectorStoreId };
  void syncSource(sourceType, sourceId, deps).catch(() => {});
}

const EMPTY: MetricSyncCountsDTO = { synced: 0, pending: 0, failed: 0 };

export async function getMetricStatus(): Promise<MetricStatusDTO> {
  const env = getMetricEnv();
  const grouped = await prisma.knowledgeSyncRecord.groupBy({ by: ["sourceType", "status"], _count: { _all: true } });
  const bySource: Record<MetricSourceTypeDTO, MetricSyncCountsDTO> = {
    ACADEMY: { ...EMPTY }, SCRIPT: { ...EMPTY }, INSTRUCTION: { ...EMPTY }, DOCUMENT: { ...EMPTY },
  };
  const totals: MetricSyncCountsDTO = { ...EMPTY };
  for (const g of grouped) {
    const key = g.sourceType as MetricSourceTypeDTO;
    const n = g._count._all;
    const bucket = g.status === "SYNCED" ? "synced" : g.status === "PENDING" ? "pending" : "failed";
    bySource[key][bucket] += n;
    totals[bucket] += n;
  }
  return {
    ready: isMetricReady(env),
    enabled: env.enabled,
    hasApiKey: Boolean(env.apiKey),
    hasVectorStore: Boolean(env.vectorStoreId),
    model: env.model,
    bySource,
    totals,
  };
}
