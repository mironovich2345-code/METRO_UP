import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { AuthError } from "./authz";
import { getStorageProvider } from "@/lib/storage/provider";
import { validateUpload } from "@/lib/storage/validation";
import { avatarKeyPrefix, extForAvatarMime, isOwnAvatarKey } from "./avatar-core";

/**
 * METRO UP ROUND 1, Milestone 1 — self-service avatar upload. Reuses the
 * EXISTING S3-compatible storage abstraction (src/lib/storage) unchanged —
 * the same signed-PUT-then-headObject-verify flow media.ts's lesson-content
 * uploads already use, not a parallel storage system. Avatars deliberately
 * do NOT go through MediaAsset (that model's width/height/duration/
 * createdById lifecycle is shaped for admin-uploaded lesson media with a
 * many-consumers ownership model; an avatar is a single nullable field on
 * the owning User row, simpler and one-to-one by construction).
 *
 * SECURITY (section 7): every function here takes the ACTING user's id as
 * its first parameter, always derived server-side from the session
 * (requireUser()/requireActiveAccess() in the route) — never a client-
 * supplied userId. The storage key itself is namespaced `avatars/<userId>/
 * <uuid>.<ext>`; completeAvatarUpload REQUIRES the key to start with the
 * CALLER's own namespace, so even a client that somehow learned another
 * user's in-flight (unconfirmed) storage key cannot point their own avatar
 * at it — the check is a plain string comparison against a value derived
 * entirely from the session, never from client input.
 */

export interface AvatarUploadTicket {
  uploadUrl: string;
  storageKey: string;
  requiredHeaders: Record<string, string>;
  expiresInSeconds: number;
}

/** Step 1 — validate the declared contentType/sizeBytes and issue a
 * short-lived signed PUT URL. The actual binary goes DIRECTLY from the
 * browser to storage, never through this server/Railway's filesystem. */
export async function requestAvatarUpload(
  userId: string,
  input: { contentType: string; sizeBytes: number },
): Promise<AvatarUploadTicket> {
  const check = validateUpload("AVATAR", input.contentType, input.sizeBytes);
  if (!check.ok) throw new AuthError(400, check.code, check.message);

  const storageKey = `${avatarKeyPrefix(userId)}${randomUUID()}.${extForAvatarMime(input.contentType)}`;

  const storage = getStorageProvider();
  const signed = await storage.createSignedUploadUrl({ storageKey, contentType: input.contentType });

  return {
    uploadUrl: signed.uploadUrl,
    storageKey,
    requiredHeaders: signed.requiredHeaders,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

/**
 * Step 2 — confirm the upload actually landed in storage, re-validate the
 * REAL mime/size storage reports (never the client's original declared
 * values — the signed PUT only signs the `host` header, so a client could
 * in principle PUT a different Content-Type than it declared at step 1; see
 * s3-provider.ts's own doc comment), and only then commit it as the user's
 * avatar. The previous avatar object (if any) is deleted best-effort,
 * AFTER the new one is already committed — a delete failure never blocks
 * or rolls back a successful replace.
 */
export async function completeAvatarUpload(userId: string, storageKey: string): Promise<{ avatarUrl: string }> {
  if (!isOwnAvatarKey(userId, storageKey)) {
    throw new AuthError(403, "forbidden", "Недостаточно прав для этого действия");
  }

  const storage = getStorageProvider();
  const head = await storage.headObject(storageKey);
  if (!head.exists) {
    throw new AuthError(409, "upload_not_found", "Файл не найден в хранилище");
  }

  const recheck = validateUpload("AVATAR", head.mimeType ?? "", head.sizeBytes ?? 0);
  if (!recheck.ok) {
    // The actually-uploaded object doesn't match what was declared — reject
    // and clean up rather than ever committing it as someone's avatar.
    await storage.deleteObject(storageKey).catch(() => {});
    throw new AuthError(400, recheck.code, recheck.message);
  }

  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarStorageKey: true } });

  await prisma.user.update({ where: { id: userId }, data: { avatarStorageKey: storageKey } });

  if (previous?.avatarStorageKey && previous.avatarStorageKey !== storageKey) {
    await storage.deleteObject(previous.avatarStorageKey).catch(() => {});
  }

  return { avatarUrl: storage.getObjectUrl(storageKey) };
}

/** Derive the public delivery URL for a stored avatar key, or null when the
 * user has none — the one place every DTO that needs to expose an avatar
 * calls through, so the URL-construction rule never duplicates. */
export function avatarUrlForKey(storageKey: string | null): string | null {
  if (!storageKey) return null;
  return getStorageProvider().getObjectUrl(storageKey);
}
