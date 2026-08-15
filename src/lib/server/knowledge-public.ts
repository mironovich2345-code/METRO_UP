import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { scriptContentSchema, instructionBlocksSchema, normalizeBlocks } from "./knowledge-schemas";
import { SCRIPT_POSITIONS, canAccessScripts } from "@/lib/knowledge-access";
import type {
  EmployeeScriptsPayload,
  ScriptDetailDTO,
  ScriptContentDTO,
  EmployeeInstructionsPayload,
  InstructionDetailDTO,
  InstructionBlockDTO,
} from "@/lib/api/knowledge-types";

/**
 * Employee-facing knowledge reads. NEVER returns DRAFT/ARCHIVED — only
 * PUBLISHED. Scripts are gated to sales-facing positions (CLIENT_MANAGER,
 * NIGHT_MANAGER); instructions are available to every employee.
 */

export { SCRIPT_POSITIONS, canAccessScripts };

function parseScriptContent(raw: unknown): ScriptContentDTO {
  const parsed = scriptContentSchema.safeParse(raw);
  return (parsed.success ? parsed.data : scriptContentSchema.parse({})) as ScriptContentDTO;
}

function parseBlocks(raw: unknown): InstructionBlockDTO[] {
  const parsed = instructionBlocksSchema.safeParse(raw);
  return normalizeBlocks(parsed.success ? parsed.data : []) as InstructionBlockDTO[];
}

/* -------------------------------- scripts -------------------------------- */

export async function getEmployeeScripts(): Promise<EmployeeScriptsPayload> {
  const scripts = await prisma.script.findMany({
    where: { status: "PUBLISHED", category: { isActive: true } },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true, title: true, slug: true, description: true, categoryId: true },
  });
  const categoryIds = new Set(scripts.map((s) => s.categoryId));
  const categories = await prisma.scriptCategory.findMany({
    where: { isActive: true, id: { in: [...categoryIds] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, slug: true, description: true, order: true, isActive: true },
  });
  return {
    categories: categories.map((c) => ({ ...c })),
    scripts,
  };
}

export async function getEmployeeScriptBySlug(slug: string): Promise<ScriptDetailDTO> {
  const s = await prisma.script.findFirst({
    where: { slug, status: "PUBLISHED", category: { isActive: true } },
    include: { category: { select: { title: true } } },
  });
  if (!s) throw new AuthError(404, "script_not_found");
  return {
    id: s.id, title: s.title, slug: s.slug, description: s.description,
    categoryId: s.categoryId, categoryTitle: s.category.title,
    content: parseScriptContent(s.content),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/* ------------------------------ instructions ----------------------------- */

export async function getEmployeeInstructions(): Promise<EmployeeInstructionsPayload> {
  const instructions = await prisma.workInstruction.findMany({
    where: { status: "PUBLISHED", category: { isActive: true } },
    orderBy: [{ order: "asc" }, { title: "asc" }],
    select: { id: true, title: true, slug: true, summary: true, categoryId: true },
  });
  const categoryIds = new Set(instructions.map((i) => i.categoryId));
  const categories = await prisma.workInstructionCategory.findMany({
    where: { isActive: true, id: { in: [...categoryIds] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, slug: true, description: true, order: true, isActive: true },
  });
  return { categories: categories.map((c) => ({ ...c })), instructions };
}

export async function getEmployeeInstructionBySlug(slug: string): Promise<InstructionDetailDTO> {
  const w = await prisma.workInstruction.findFirst({
    where: { slug, status: "PUBLISHED", category: { isActive: true } },
    include: { category: { select: { title: true } } },
  });
  if (!w) throw new AuthError(404, "instruction_not_found");
  return {
    id: w.id, title: w.title, slug: w.slug, summary: w.summary,
    categoryId: w.categoryId, categoryTitle: w.category.title,
    blocks: parseBlocks(w.blocks),
    updatedAt: w.updatedAt.toISOString(),
  };
}
