import "server-only";
import { prisma } from "./db";
import { getStorageProvider } from "@/lib/storage/provider";
import { instructionBlocksSchema, normalizeBlocks, type InstructionBlock } from "./knowledge-schemas";
import type { InstructionBlockDTO } from "@/lib/api/knowledge-types";

/**
 * Parse stored instruction blocks and resolve IMAGE references to delivery URLs.
 *
 * IMAGE blocks persist only a `mediaAssetId` (+ alt/caption) — never a storage URL
 * or binary. Here we look up each asset and produce a public delivery URL, but
 * only for assets that finished uploading (status READY); anything else resolves
 * to `url: null` so the renderer shows a graceful placeholder. If object storage
 * is not configured, images degrade to `url: null` and the rest of the
 * instruction still renders. Non-IMAGE blocks are unchanged.
 */
export async function resolveInstructionBlocks(raw: unknown): Promise<InstructionBlockDTO[]> {
  const parsed = instructionBlocksSchema.safeParse(raw);
  const blocks = normalizeBlocks(parsed.success ? parsed.data : []);

  const imageIds = blocks
    .filter((b): b is Extract<InstructionBlock, { type: "IMAGE" }> => b.type === "IMAGE")
    .map((b) => b.mediaAssetId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const urlById = new Map<string, string | null>();
  if (imageIds.length) {
    let storage: ReturnType<typeof getStorageProvider> | null = null;
    try { storage = getStorageProvider(); } catch { storage = null; }
    const assets = await prisma.mediaAsset.findMany({ where: { id: { in: imageIds } } });
    for (const a of assets) {
      let url: string | null = null;
      if (storage && a.status === "READY") {
        try { url = storage.getObjectUrl(a.storageKey); } catch { url = null; }
      }
      urlById.set(a.id, url);
    }
  }

  return blocks.map((b): InstructionBlockDTO => {
    if (b.type === "IMAGE") {
      const mediaAssetId = b.mediaAssetId ?? null;
      return {
        id: b.id!,
        type: "IMAGE",
        mediaAssetId,
        url: mediaAssetId ? urlById.get(mediaAssetId) ?? null : null,
        alt: b.alt ?? null,
        caption: b.caption ?? null,
      };
    }
    return b as InstructionBlockDTO;
  });
}
