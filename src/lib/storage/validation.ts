import { randomUUID } from "node:crypto";
import type { StorageObjectKind } from "./types";

/**
 * File upload rules (MVP). Validation trusts MIME + declared size, NEVER the
 * file extension. The stored key is always random — the user's filename is only
 * kept as metadata and never used as a storage path (no path traversal).
 */

export const MEDIA_RULES = {
  VIDEO: {
    mimes: ["video/mp4", "video/webm"] as const,
    maxBytes: 500 * 1024 * 1024, // 500 MB
    prefix: "videos",
  },
  IMAGE: {
    mimes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxBytes: 10 * 1024 * 1024, // 10 MB
    prefix: "images",
  },
  DOCUMENT: {
    mimes: ["application/pdf"] as const,
    maxBytes: 25 * 1024 * 1024, // 25 MB
    prefix: "documents",
  },
} as const;

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type UploadValidationCode =
  | "UNSUPPORTED_MIME"
  | "FILE_TOO_LARGE"
  | "INVALID_SIZE";

export type UploadValidation =
  | { ok: true }
  | { ok: false; code: UploadValidationCode; message: string };

/** Validate a requested upload against the rules for its kind. */
export function validateUpload(
  kind: StorageObjectKind,
  mimeType: string,
  sizeBytes: number,
): UploadValidation {
  const rule = MEDIA_RULES[kind];
  if (!(rule.mimes as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      code: "UNSUPPORTED_MIME",
      message: `Недопустимый тип файла. Разрешено: ${rule.mimes.join(", ")}`,
    };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, code: "INVALID_SIZE", message: "Некорректный размер файла" };
  }
  if (sizeBytes > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / (1024 * 1024));
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Файл превышает лимит ${mb} МБ`,
    };
  }
  return { ok: true };
}

/** Random, collision-resistant storage key. Extension derives from MIME only. */
export function randomStorageKey(kind: StorageObjectKind, mimeType: string): string {
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  return `${MEDIA_RULES[kind].prefix}/${randomUUID()}.${ext}`;
}

export function mediaKindForMime(mimeType: string): StorageObjectKind | null {
  if ((MEDIA_RULES.VIDEO.mimes as readonly string[]).includes(mimeType)) return "VIDEO";
  if ((MEDIA_RULES.IMAGE.mimes as readonly string[]).includes(mimeType)) return "IMAGE";
  if ((MEDIA_RULES.DOCUMENT.mimes as readonly string[]).includes(mimeType)) return "DOCUMENT";
  return null;
}
