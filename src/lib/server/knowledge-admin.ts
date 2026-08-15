import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { writeAudit } from "./audit";
import { slugify } from "./content";
import {
  scriptContentSchema,
  instructionBlocksSchema,
  normalizeBlocks,
  scriptHasContent,
  instructionHasContent,
  type CategoryCreate,
  type CategoryUpdate,
  type ScriptCreate,
  type ScriptUpdate,
  type InstructionCreate,
  type InstructionUpdate,
  type ScriptContent,
  type InstructionBlock,
} from "./knowledge-schemas";
import type {
  ScriptCategoryDTO,
  ScriptAdminRowDTO,
  ScriptAdminDetailDTO,
  ScriptContentDTO,
  InstructionCategoryDTO,
  InstructionAdminRowDTO,
  InstructionAdminDetailDTO,
  InstructionBlockDTO,
} from "@/lib/api/knowledge-types";

/**
 * Admin CMS mutations for the knowledge base. Every mutation writes a
 * ContentAuditLog record (reuses the existing audit trail). A PUBLISHED item is
 * read-only for edits — the admin returns it to DRAFT first, so employees never
 * see a half-edited published entry (same safety model as Academy lessons).
 */

const EMPTY_CONTENT: ScriptContent = scriptContentSchema.parse({});

/* -------------------------------- helpers -------------------------------- */

async function uniqueSlug(
  title: string,
  find: (slug: string) => Promise<{ id: string } | null>,
  exceptId?: string,
): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const existing = await find(candidate);
    if (!existing || existing.id === exceptId) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

function parseScriptContent(raw: unknown): ScriptContentDTO {
  const parsed = scriptContentSchema.safeParse(raw);
  return (parsed.success ? parsed.data : EMPTY_CONTENT) as ScriptContentDTO;
}

function parseBlocks(raw: unknown): InstructionBlockDTO[] {
  const parsed = instructionBlocksSchema.safeParse(raw);
  const blocks = normalizeBlocks(parsed.success ? parsed.data : []);
  return blocks as InstructionBlockDTO[];
}

/* --------------------------- script categories --------------------------- */

function toScriptCategoryDTO(c: {
  id: string; title: string; slug: string; description: string | null; order: number; isActive: boolean;
  _count?: { scripts: number };
}): ScriptCategoryDTO {
  return {
    id: c.id, title: c.title, slug: c.slug, description: c.description,
    order: c.order, isActive: c.isActive,
    scriptCount: c._count?.scripts,
  };
}

export async function listScriptCategories(): Promise<ScriptCategoryDTO[]> {
  const rows = await prisma.scriptCategory.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { scripts: true } } },
  });
  return rows.map(toScriptCategoryDTO);
}

export async function createScriptCategory(actorUserId: string, input: CategoryCreate): Promise<ScriptCategoryDTO> {
  const slug = await uniqueSlug(input.title, (s) => prisma.scriptCategory.findUnique({ where: { slug: s } }));
  const max = await prisma.scriptCategory.aggregate({ _max: { order: true } });
  const cat = await prisma.scriptCategory.create({
    data: {
      title: input.title, slug, description: input.description ?? null,
      order: input.order ?? (max._max.order ?? 0) + 1,
      isActive: input.isActive ?? true,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "ScriptCategory", entityId: cat.id, action: "CREATE" });
  return toScriptCategoryDTO(cat);
}

export async function updateScriptCategory(actorUserId: string, id: string, input: CategoryUpdate): Promise<ScriptCategoryDTO> {
  const existing = await prisma.scriptCategory.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "category_not_found");
  const data: Prisma.ScriptCategoryUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.order !== undefined) data.order = input.order;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  const cat = await prisma.scriptCategory.update({ where: { id }, data });
  await writeAudit(prisma, { actorUserId, entityType: "ScriptCategory", entityId: id, action: "UPDATE" });
  return toScriptCategoryDTO(cat);
}

/* -------------------------------- scripts -------------------------------- */

function toScriptRowDTO(s: {
  id: string; title: string; slug: string; categoryId: string; status: string; order: number; updatedAt: Date;
  category?: { title: string };
}): ScriptAdminRowDTO {
  return {
    id: s.id, title: s.title, slug: s.slug, categoryId: s.categoryId,
    categoryTitle: s.category?.title ?? "",
    status: s.status as ScriptAdminRowDTO["status"], order: s.order,
    updatedAt: s.updatedAt.toISOString(),
  };
}

function toScriptDetailDTO(s: {
  id: string; title: string; slug: string; categoryId: string; status: string; order: number; updatedAt: Date;
  description: string | null; content: unknown; publishedAt: Date | null; category?: { title: string };
}): ScriptAdminDetailDTO {
  return {
    ...toScriptRowDTO(s),
    description: s.description,
    content: parseScriptContent(s.content),
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
  };
}

export async function listScripts(filter?: { categoryId?: string; status?: string; q?: string }): Promise<ScriptAdminRowDTO[]> {
  const where: Prisma.ScriptWhereInput = {};
  if (filter?.categoryId) where.categoryId = filter.categoryId;
  if (filter?.status) where.status = filter.status as Prisma.ScriptWhereInput["status"];
  if (filter?.q) where.title = { contains: filter.q, mode: "insensitive" };
  const rows = await prisma.script.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: { category: { select: { title: true } } },
  });
  return rows.map(toScriptRowDTO);
}

export async function getScript(id: string): Promise<ScriptAdminDetailDTO> {
  const s = await prisma.script.findUnique({ where: { id }, include: { category: { select: { title: true } } } });
  if (!s) throw new AuthError(404, "script_not_found");
  return toScriptDetailDTO(s);
}

async function assertScriptEditable(id: string) {
  const s = await prisma.script.findUnique({ where: { id } });
  if (!s) throw new AuthError(404, "script_not_found");
  if (s.status === "PUBLISHED") throw new AuthError(409, "script_published_readonly", "Сначала верните скрипт в черновик");
  return s;
}

export async function createScript(actorUserId: string, input: ScriptCreate): Promise<ScriptAdminDetailDTO> {
  const category = await prisma.scriptCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new AuthError(404, "category_not_found");
  const slug = await uniqueSlug(input.title, (s) => prisma.script.findUnique({ where: { slug: s } }));
  const max = await prisma.script.aggregate({ where: { categoryId: input.categoryId }, _max: { order: true } });
  const content = scriptContentSchema.parse(input.content ?? {});
  const s = await prisma.script.create({
    data: {
      categoryId: input.categoryId, title: input.title, slug,
      description: input.description ?? null,
      content: content as unknown as Prisma.InputJsonValue,
      order: input.order ?? (max._max.order ?? 0) + 1,
      createdByUserId: actorUserId, updatedByUserId: actorUserId,
    },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Script", entityId: s.id, action: "CREATE" });
  return toScriptDetailDTO(s);
}

export async function updateScript(actorUserId: string, id: string, input: ScriptUpdate): Promise<ScriptAdminDetailDTO> {
  await assertScriptEditable(id);
  const data: Prisma.ScriptUpdateInput = { updatedByUserId: actorUserId };
  if (input.categoryId !== undefined) {
    const category = await prisma.scriptCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new AuthError(404, "category_not_found");
    data.category = { connect: { id: input.categoryId } };
  }
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.order !== undefined) data.order = input.order;
  if (input.content !== undefined) {
    data.content = scriptContentSchema.parse(input.content) as unknown as Prisma.InputJsonValue;
  }
  const s = await prisma.script.update({ where: { id }, data, include: { category: { select: { title: true } } } });
  await writeAudit(prisma, { actorUserId, entityType: "Script", entityId: id, action: "UPDATE" });
  return toScriptDetailDTO(s);
}

export async function publishScript(actorUserId: string, id: string): Promise<ScriptAdminDetailDTO> {
  const s = await prisma.script.findUnique({ where: { id } });
  if (!s) throw new AuthError(404, "script_not_found");
  const content = scriptContentSchema.parse(s.content);
  if (!scriptHasContent(content)) {
    throw new AuthError(400, "empty_script", "Заполните сценарий разговора перед публикацией", {
      errors: ["Секция «Сценарий разговора» пуста"],
    });
  }
  const updated = await prisma.script.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: s.publishedAt ?? new Date(), updatedByUserId: actorUserId },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, { actorUserId, entityType: "Script", entityId: id, action: "PUBLISH" });
  return toScriptDetailDTO(updated);
}

export async function setScriptStatus(actorUserId: string, id: string, status: "DRAFT" | "ARCHIVED"): Promise<ScriptAdminDetailDTO> {
  const s = await prisma.script.findUnique({ where: { id } });
  if (!s) throw new AuthError(404, "script_not_found");
  const updated = await prisma.script.update({
    where: { id },
    data: { status, updatedByUserId: actorUserId },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, {
    actorUserId, entityType: "Script", entityId: id,
    action: status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH",
  });
  return toScriptDetailDTO(updated);
}

/* ------------------------ instruction categories ------------------------- */

function toInstructionCategoryDTO(c: {
  id: string; title: string; slug: string; description: string | null; order: number; isActive: boolean;
  _count?: { instructions: number };
}): InstructionCategoryDTO {
  return {
    id: c.id, title: c.title, slug: c.slug, description: c.description,
    order: c.order, isActive: c.isActive,
    instructionCount: c._count?.instructions,
  };
}

export async function listInstructionCategories(): Promise<InstructionCategoryDTO[]> {
  const rows = await prisma.workInstructionCategory.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { instructions: true } } },
  });
  return rows.map(toInstructionCategoryDTO);
}

export async function createInstructionCategory(actorUserId: string, input: CategoryCreate): Promise<InstructionCategoryDTO> {
  const slug = await uniqueSlug(input.title, (s) => prisma.workInstructionCategory.findUnique({ where: { slug: s } }));
  const max = await prisma.workInstructionCategory.aggregate({ _max: { order: true } });
  const cat = await prisma.workInstructionCategory.create({
    data: {
      title: input.title, slug, description: input.description ?? null,
      order: input.order ?? (max._max.order ?? 0) + 1,
      isActive: input.isActive ?? true,
    },
  });
  await writeAudit(prisma, { actorUserId, entityType: "WorkInstructionCategory", entityId: cat.id, action: "CREATE" });
  return toInstructionCategoryDTO(cat);
}

export async function updateInstructionCategory(actorUserId: string, id: string, input: CategoryUpdate): Promise<InstructionCategoryDTO> {
  const existing = await prisma.workInstructionCategory.findUnique({ where: { id } });
  if (!existing) throw new AuthError(404, "category_not_found");
  const data: Prisma.WorkInstructionCategoryUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.order !== undefined) data.order = input.order;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  const cat = await prisma.workInstructionCategory.update({ where: { id }, data });
  await writeAudit(prisma, { actorUserId, entityType: "WorkInstructionCategory", entityId: id, action: "UPDATE" });
  return toInstructionCategoryDTO(cat);
}

/* ------------------------------ instructions ----------------------------- */

function toInstructionRowDTO(w: {
  id: string; title: string; slug: string; categoryId: string; status: string; order: number; updatedAt: Date;
  category?: { title: string };
}): InstructionAdminRowDTO {
  return {
    id: w.id, title: w.title, slug: w.slug, categoryId: w.categoryId,
    categoryTitle: w.category?.title ?? "",
    status: w.status as InstructionAdminRowDTO["status"], order: w.order,
    updatedAt: w.updatedAt.toISOString(),
  };
}

function toInstructionDetailDTO(w: {
  id: string; title: string; slug: string; categoryId: string; status: string; order: number; updatedAt: Date;
  summary: string | null; blocks: unknown; publishedAt: Date | null; category?: { title: string };
}): InstructionAdminDetailDTO {
  return {
    ...toInstructionRowDTO(w),
    summary: w.summary,
    blocks: parseBlocks(w.blocks),
    publishedAt: w.publishedAt ? w.publishedAt.toISOString() : null,
  };
}

export async function listInstructions(filter?: { categoryId?: string; status?: string; q?: string }): Promise<InstructionAdminRowDTO[]> {
  const where: Prisma.WorkInstructionWhereInput = {};
  if (filter?.categoryId) where.categoryId = filter.categoryId;
  if (filter?.status) where.status = filter.status as Prisma.WorkInstructionWhereInput["status"];
  if (filter?.q) where.title = { contains: filter.q, mode: "insensitive" };
  const rows = await prisma.workInstruction.findMany({
    where, orderBy: [{ updatedAt: "desc" }],
    include: { category: { select: { title: true } } },
  });
  return rows.map(toInstructionRowDTO);
}

export async function getInstruction(id: string): Promise<InstructionAdminDetailDTO> {
  const w = await prisma.workInstruction.findUnique({ where: { id }, include: { category: { select: { title: true } } } });
  if (!w) throw new AuthError(404, "instruction_not_found");
  return toInstructionDetailDTO(w);
}

async function assertInstructionEditable(id: string) {
  const w = await prisma.workInstruction.findUnique({ where: { id } });
  if (!w) throw new AuthError(404, "instruction_not_found");
  if (w.status === "PUBLISHED") throw new AuthError(409, "instruction_published_readonly", "Сначала верните инструкцию в черновик");
  return w;
}

export async function createInstruction(actorUserId: string, input: InstructionCreate): Promise<InstructionAdminDetailDTO> {
  const category = await prisma.workInstructionCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new AuthError(404, "category_not_found");
  const slug = await uniqueSlug(input.title, (s) => prisma.workInstruction.findUnique({ where: { slug: s } }));
  const max = await prisma.workInstruction.aggregate({ where: { categoryId: input.categoryId }, _max: { order: true } });
  const blocks = normalizeBlocks(input.blocks ?? []);
  const w = await prisma.workInstruction.create({
    data: {
      categoryId: input.categoryId, title: input.title, slug,
      summary: input.summary ?? null,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      order: input.order ?? (max._max.order ?? 0) + 1,
      createdByUserId: actorUserId, updatedByUserId: actorUserId,
    },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, { actorUserId, entityType: "WorkInstruction", entityId: w.id, action: "CREATE" });
  return toInstructionDetailDTO(w);
}

export async function updateInstruction(actorUserId: string, id: string, input: InstructionUpdate): Promise<InstructionAdminDetailDTO> {
  await assertInstructionEditable(id);
  const data: Prisma.WorkInstructionUpdateInput = { updatedByUserId: actorUserId };
  if (input.categoryId !== undefined) {
    const category = await prisma.workInstructionCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new AuthError(404, "category_not_found");
    data.category = { connect: { id: input.categoryId } };
  }
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary ?? null;
  if (input.order !== undefined) data.order = input.order;
  if (input.blocks !== undefined) {
    data.blocks = normalizeBlocks(input.blocks) as unknown as Prisma.InputJsonValue;
  }
  const w = await prisma.workInstruction.update({ where: { id }, data, include: { category: { select: { title: true } } } });
  await writeAudit(prisma, { actorUserId, entityType: "WorkInstruction", entityId: id, action: "UPDATE" });
  return toInstructionDetailDTO(w);
}

export async function publishInstruction(actorUserId: string, id: string): Promise<InstructionAdminDetailDTO> {
  const w = await prisma.workInstruction.findUnique({ where: { id } });
  if (!w) throw new AuthError(404, "instruction_not_found");
  const parsed = instructionBlocksSchema.safeParse(w.blocks);
  const blocks: InstructionBlock[] = parsed.success ? parsed.data : [];
  if (!instructionHasContent(blocks)) {
    throw new AuthError(400, "empty_instruction", "Добавьте хотя бы один непустой блок перед публикацией", {
      errors: ["Инструкция не содержит блоков с контентом"],
    });
  }
  const updated = await prisma.workInstruction.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: w.publishedAt ?? new Date(), updatedByUserId: actorUserId },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, { actorUserId, entityType: "WorkInstruction", entityId: id, action: "PUBLISH" });
  return toInstructionDetailDTO(updated);
}

export async function setInstructionStatus(actorUserId: string, id: string, status: "DRAFT" | "ARCHIVED"): Promise<InstructionAdminDetailDTO> {
  const w = await prisma.workInstruction.findUnique({ where: { id } });
  if (!w) throw new AuthError(404, "instruction_not_found");
  const updated = await prisma.workInstruction.update({
    where: { id },
    data: { status, updatedByUserId: actorUserId },
    include: { category: { select: { title: true } } },
  });
  await writeAudit(prisma, {
    actorUserId, entityType: "WorkInstruction", entityId: id,
    action: status === "ARCHIVED" ? "ARCHIVE" : "UNPUBLISH",
  });
  return toInstructionDetailDTO(updated);
}
