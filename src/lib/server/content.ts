import "server-only";
import type { LessonBlock } from "@prisma/client";
import { prisma } from "./db";
import { getStorageProvider } from "@/lib/storage/provider";
import type { LessonBlockDTO } from "@/lib/api/content-types";
import { safeParseBlockData, type RichDoc } from "./content-schemas";

/**
 * Content helpers: slug generation and mapping DB blocks to the client-safe
 * block DTOs (resolving media ids to delivery URLs). Only READY media resolves
 * to a URL; anything else resolves to null so the player degrades gracefully.
 */

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .split("")
    .map((c) => CYR[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return base || "lesson";
}

/** Produce a slug unique across lessons; appends a short suffix on collision. */
export async function uniqueLessonSlug(title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const existing = await prisma.lesson.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === exceptId) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

/** Collect media ids referenced by VIDEO/IMAGE blocks. */
function mediaIdsOf(blocks: LessonBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    const d = b.data as Record<string, unknown> | null;
    if (!d) continue;
    if (b.type === "VIDEO") {
      if (typeof d.mediaAssetId === "string") ids.add(d.mediaAssetId);
      if (typeof d.posterMediaAssetId === "string") ids.add(d.posterMediaAssetId as string);
    }
    if (b.type === "IMAGE" && typeof d.mediaAssetId === "string") ids.add(d.mediaAssetId);
  }
  return [...ids];
}

/**
 * Map DB blocks → client DTOs. Media ids are resolved to delivery URLs (READY
 * only). Invalid block data is skipped defensively rather than throwing.
 */
export async function toLessonBlockDTOs(blocks: LessonBlock[]): Promise<LessonBlockDTO[]> {
  const ids = mediaIdsOf(blocks);
  const storage = getStorageProvider();
  const urlById = new Map<string, string | null>();
  if (ids.length) {
    const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
    for (const a of assets) {
      urlById.set(a.id, a.status === "READY" ? storage.getObjectUrl(a.storageKey) : null);
    }
  }
  const resolve = (id: unknown): string | null =>
    typeof id === "string" ? urlById.get(id) ?? null : null;

  const out: LessonBlockDTO[] = [];
  for (const b of blocks.slice().sort((a, z) => a.order - z.order)) {
    const parsed = safeParseBlockData(b.type, b.data);
    if (!parsed.success) continue;
    const d = parsed.data as Record<string, unknown>;
    switch (b.type) {
      case "VIDEO":
        out.push({
          id: b.id, type: "VIDEO", order: b.order,
          url: resolve(d.mediaAssetId),
          posterUrl: resolve(d.posterMediaAssetId),
          caption: (d.caption as string) ?? null,
        });
        break;
      case "IMAGE":
        out.push({
          id: b.id, type: "IMAGE", order: b.order,
          url: resolve(d.mediaAssetId),
          alt: (d.alt as string) ?? null,
          caption: (d.caption as string) ?? null,
        });
        break;
      case "TEXT":
        out.push({ id: b.id, type: "TEXT", order: b.order, doc: d.doc as RichDoc });
        break;
      case "INFO_CARD":
        out.push({
          id: b.id, type: "INFO_CARD", order: b.order,
          title: d.title as string, text: d.text as string,
          variant: (d.variant as "DEFAULT" | "TIP" | "IMPORTANT" | "WARNING") ?? "DEFAULT",
        });
        break;
      case "CHECKLIST":
        out.push({
          id: b.id, type: "CHECKLIST", order: b.order,
          title: (d.title as string) ?? null,
          items: d.items as { text: string }[],
        });
        break;
      case "SUMMARY":
        out.push({
          id: b.id, type: "SUMMARY", order: b.order,
          title: (d.title as string) ?? null,
          points: d.points as string[],
        });
        break;
      default:
        break;
    }
  }
  return out;
}

/** A block counts as "meaningful" for publish if it renders real content. */
export function isMeaningfulBlock(type: string): boolean {
  return ["VIDEO", "TEXT", "IMAGE", "INFO_CARD", "CHECKLIST", "SUMMARY"].includes(type);
}
