import "server-only";

/**
 * Storage abstraction. Business logic depends on this interface, never on a
 * concrete provider (Cloudflare R2 today, anything S3-compatible tomorrow).
 * All credentials are read server-side only and are never sent to the client.
 */

export type StorageObjectKind = "VIDEO" | "IMAGE" | "DOCUMENT";

/** A short-lived signed URL the browser uses to upload directly to storage. */
export interface SignedUpload {
  method: "PUT";
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  /** Headers the browser MUST send with the PUT so the signature matches. */
  requiredHeaders: Record<string, string>;
}

/** Result of a HEAD against a stored object (used to verify a completed upload). */
export interface ObjectHead {
  exists: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
}

export interface CreateSignedUploadInput {
  storageKey: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface StorageProvider {
  readonly name: string;
  /** True when credentials/bucket are configured; false → operations will throw. */
  readonly configured: boolean;
  createSignedUploadUrl(input: CreateSignedUploadInput): Promise<SignedUpload>;
  /** Short-lived signed GET URL — used for private downloads (e.g. ADMIN docs). */
  createSignedDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
  /** Public (or public-base) URL for delivery. Playback/delivery URL. */
  getObjectUrl(storageKey: string): string;
  headObject(storageKey: string): Promise<ObjectHead>;
  deleteObject(storageKey: string): Promise<void>;
}

/** Thrown when a storage operation is attempted without configured credentials. */
export class StorageNotConfiguredError extends Error {
  code = "storage_not_configured";
  constructor(message = "Object storage is not configured") {
    super(message);
  }
}
