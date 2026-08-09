import "server-only";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { writeAudit } from "./audit";
import { getStorageProvider } from "@/lib/storage/provider";
import {
  mediaKindForMime,
  randomStorageKey,
  validateUpload,
} from "@/lib/storage/validation";

/**
 * MediaAsset lifecycle. The DB stores only metadata — never binary. Upload is a
 * two-step, server-authorized flow: create UPLOADING + signed PUT, then verify
 * the object exists (headObject) before flipping to READY.
 */

export interface CreatedUpload {
  mediaAssetId: string;
  uploadUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

export async function createMediaUpload(
  actorUserId: string,
  input: { filename: string; contentType: string; sizeBytes: number },
): Promise<CreatedUpload> {
  const kind = mediaKindForMime(input.contentType);
  if (!kind) throw new AuthError(400, "UNSUPPORTED_MIME", "Недопустимый тип файла");

  const check = validateUpload(kind, input.contentType, input.sizeBytes);
  if (!check.ok) throw new AuthError(400, check.code, check.message);

  const storage = getStorageProvider();
  const storageKey = randomStorageKey(kind, input.contentType);
  // Short-lived signed URL (throws storage_not_configured if unset).
  const signed = await storage.createSignedUploadUrl({
    storageKey,
    contentType: input.contentType,
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      kind,
      status: "UPLOADING",
      storageProvider: storage.name,
      storageKey,
      mimeType: input.contentType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.filename.slice(0, 300),
      createdById: actorUserId,
    },
  });
  await writeAudit(prisma, {
    actorUserId,
    entityType: "MediaAsset",
    entityId: asset.id,
    action: "MEDIA_UPLOAD",
    metadata: { kind, mimeType: input.contentType, sizeBytes: input.sizeBytes },
  });

  return {
    mediaAssetId: asset.id,
    uploadUrl: signed.uploadUrl,
    storageKey,
    requiredHeaders: signed.requiredHeaders,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

export async function completeMediaUpload(
  actorUserId: string,
  mediaAssetId: string,
  hints: { width?: number; height?: number; durationSeconds?: number },
) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) throw new AuthError(404, "media_not_found");
  if (asset.status === "READY") return asset; // idempotent

  const storage = getStorageProvider();
  const head = await storage.headObject(asset.storageKey);
  if (!head.exists) {
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: { status: "FAILED" },
    });
    throw new AuthError(409, "upload_not_found", "Объект не найден в хранилище");
  }

  return prisma.mediaAsset.update({
    where: { id: mediaAssetId },
    data: {
      status: "READY",
      sizeBytes: head.sizeBytes ?? asset.sizeBytes,
      mimeType: head.mimeType ?? asset.mimeType,
      width: hints.width ?? asset.width,
      height: hints.height ?? asset.height,
      durationSeconds: hints.durationSeconds ?? asset.durationSeconds,
    },
  });
}
