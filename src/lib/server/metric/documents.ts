import { richDocToPlain } from "@/lib/rich-text";
import type { RichDoc } from "@/lib/server/content-schemas";
import type { LessonBlockDTO } from "@/lib/api/content-types";
import type { ScriptDetailDTO, InstructionDetailDTO } from "@/lib/api/knowledge-types";
import type { KnowledgeAttributes } from "./openai";
import { scopeForSource, type MetricSourceType, type PositionScope } from "./access";

/**
 * Knowledge document builders (pure — unit testable). Each PUBLISHED source
 * becomes one readable, labelled plain-text document plus small attributes used
 * for retrieval + access filtering. No JSON internals, quiz answer keys, media
 * urls or secrets are ever included.
 */
export interface KnowledgeDoc {
  sourceType: MetricSourceType;
  sourceId: string;
  filename: string;
  content: string;
  positionScope: PositionScope;
  attributes: KnowledgeAttributes;
}

function clip(s: string, max = 480): string {
  return s.length > max ? s.slice(0, max) : s;
}

function section(label: string, body: string | null | undefined): string {
  const t = (body ?? "").trim();
  return t ? `${label}:\n${t}\n` : "";
}

function list(label: string, items: string[]): string {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  return clean.length ? `${label}:\n${clean.map((i) => `- ${i}`).join("\n")}\n` : "";
}

function baseAttributes(
  sourceType: MetricSourceType,
  sourceId: string,
  title: string,
  slug: string,
  updatedAt: string,
  scope: PositionScope,
): KnowledgeAttributes {
  return {
    sourceType,
    sourceId,
    title: clip(title, 200),
    slug: clip(slug, 200),
    status: "PUBLISHED",
    positionScope: scope,
    updatedAt: clip(updatedAt, 40),
  };
}

/* -------------------------------- scripts -------------------------------- */

export function buildScriptDoc(s: ScriptDetailDTO, updatedAt: string): KnowledgeDoc {
  const scope = scopeForSource("SCRIPT");
  const c = s.content;
  const content = [
    `ТИП: Скрипт (рабочий сценарий разговора)`,
    `НАЗВАНИЕ: ${s.title}`,
    `КАТЕГОРИЯ: ${s.categoryTitle}`,
    section("ОПИСАНИЕ", s.description),
    "",
    section("КОГДА ИСПОЛЬЗОВАТЬ", c.whenToUse),
    section("ЦЕЛЬ", c.goal),
    list("КЛЮЧЕВЫЕ ВОПРОСЫ", c.keyQuestions),
    section("СЦЕНАРИЙ РАЗГОВОРА", richDocToPlain(c.script as RichDoc)),
    list("НЕ ГОВОРИТЬ", c.doNotSay),
    section("СЛЕДУЮЩИЙ ШАГ", c.nextStep),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    sourceType: "SCRIPT",
    sourceId: s.id,
    filename: `script-${s.slug}.txt`,
    content,
    positionScope: scope,
    attributes: baseAttributes("SCRIPT", s.id, s.title, s.slug, updatedAt, scope),
  };
}

/* ------------------------------ instructions ----------------------------- */

export function buildInstructionDoc(w: InstructionDetailDTO, updatedAt: string): KnowledgeDoc {
  const scope = scopeForSource("INSTRUCTION");
  const parts: string[] = [
    `ТИП: Рабочая инструкция (регламент)`,
    `НАЗВАНИЕ: ${w.title}`,
    `КАТЕГОРИЯ: ${w.categoryTitle}`,
    section("КРАТКО", w.summary),
    "",
  ];
  for (const b of w.blocks) {
    switch (b.type) {
      case "TEXT":
        parts.push(section("ТЕКСТ", richDocToPlain(b.doc as RichDoc)));
        break;
      case "STEPS":
        parts.push(list(b.title ? `ШАГИ — ${b.title}` : "ШАГИ", b.steps.map((s) => s.text)));
        break;
      case "CHECKLIST":
        parts.push(list(b.title ? `ЧЕК-ЛИСТ — ${b.title}` : "ЧЕК-ЛИСТ", b.items.map((i) => i.text)));
        break;
      case "INFO_CARD":
        parts.push(section(b.title ? `ВАЖНО — ${b.title}` : "ВАЖНО", b.text));
        break;
      case "WARNING":
        parts.push(section(b.title ? `ПРЕДУПРЕЖДЕНИЕ — ${b.title}` : "ПРЕДУПРЕЖДЕНИЕ", b.text));
        break;
      case "IMAGE": {
        // Index ONLY the human caption/alt text — never the storage URL or binary.
        const label = (b.caption ?? b.alt ?? "").trim();
        if (label) parts.push(`[Изображение: ${label}]\n`);
        break;
      }
    }
  }
  return {
    sourceType: "INSTRUCTION",
    sourceId: w.id,
    filename: `instruction-${w.slug}.txt`,
    content: parts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    positionScope: scope,
    attributes: baseAttributes("INSTRUCTION", w.id, w.title, w.slug, updatedAt, scope),
  };
}

/* --------------------------------- lessons ------------------------------- */

/* ---------------------------- corporate documents ------------------------ */

const DOC_CATEGORY_RU: Record<string, string> = {
  TRAINING_MANUAL: "Учебное пособие", CLUB_RULES: "Правила клуба", WORK_REGULATION: "Рабочий регламент",
  CONTRACT_TEMPLATE: "Шаблон договора", SALES_MATERIAL: "Материал по продажам", FINANCE_CASH: "Финансы/касса",
  REFUNDS: "Возвраты", HR: "Кадры", OTHER: "Прочее",
};

export interface DocumentDocInput {
  id: string;
  title: string;
  description: string | null;
  category: string;
  extractedText: string;
  positionScope: PositionScope;
  versionLabel: string | null;
  updatedAt: string;
}

/** Cap the indexed text so a huge manual is chunked by file_search, not dumped whole. */
const DOC_TEXT_CAP = 200_000;

export function buildDocumentDoc(d: DocumentDocInput): KnowledgeDoc {
  const content = [
    `ТИП: Корпоративный документ`,
    `НАЗВАНИЕ: ${d.title}`,
    `КАТЕГОРИЯ: ${DOC_CATEGORY_RU[d.category] ?? d.category}`,
    d.versionLabel ? `ВЕРСИЯ: ${d.versionLabel}` : "",
    section("ОПИСАНИЕ", d.description),
    "",
    d.extractedText.slice(0, DOC_TEXT_CAP),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    sourceType: "DOCUMENT",
    sourceId: d.id,
    filename: `document-${d.id}.txt`,
    content,
    positionScope: d.positionScope,
    attributes: baseAttributes("DOCUMENT", d.id, d.title, d.id, d.updatedAt, d.positionScope),
  };
}

export interface LessonDocInput {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  blocks: LessonBlockDTO[];
  updatedAt: string;
}

export function buildLessonDoc(l: LessonDocInput): KnowledgeDoc {
  const scope = scopeForSource("ACADEMY");
  const parts: string[] = [
    `ТИП: Учебный урок (Академия)`,
    `НАЗВАНИЕ: ${l.title}`,
    section("КРАТКО", l.shortDescription),
    "",
  ];
  for (const b of l.blocks) {
    switch (b.type) {
      case "COLLAPSIBLE_TEXT":
        parts.push(section(b.title || "ТЕКСТ", richDocToPlain(b.doc)));
        break;
      case "TEXT":
        parts.push(section("ТЕКСТ", richDocToPlain(b.doc)));
        break;
      case "INFO_CARD":
        parts.push(section(b.title || "ВАЖНО", b.text));
        break;
      case "KEY_TAKEAWAYS":
        parts.push(list(b.title || "ГЛАВНОЕ", b.items.map((i) => [i.title, i.text].filter(Boolean).join(" — "))));
        break;
      case "SUMMARY":
        parts.push(list(b.title || "ИТОГИ", b.points));
        break;
      // VIDEO / IMAGE / CHECKLIST are not indexed as corporate facts.
    }
  }
  return {
    sourceType: "ACADEMY",
    sourceId: l.id,
    filename: `academy-${l.slug}.txt`,
    content: parts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    positionScope: scope,
    attributes: baseAttributes("ACADEMY", l.id, l.title, l.slug, l.updatedAt, scope),
  };
}
