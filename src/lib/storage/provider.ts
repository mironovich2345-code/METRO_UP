import "server-only";
import { S3StorageProvider } from "./s3-provider";
import {
  StorageNotConfiguredError,
  type CreateSignedUploadInput,
  type ObjectHead,
  type SignedUpload,
  type StorageProvider,
} from "./types";

/**
 * Provider factory. Reads storage credentials from the environment (server-only)
 * and returns an S3-compatible provider. When storage is not configured the app
 * still builds and runs — a NullStorageProvider throws a clear, safe error only
 * when an upload/delete is actually attempted.
 */

function readS3Config() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const region = process.env.STORAGE_REGION ?? "auto";
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL;
  if (
    endpoint &&
    bucket &&
    accessKeyId &&
    secretAccessKey &&
    publicBaseUrl
  ) {
    return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
  }
  return null;
}

class NullStorageProvider implements StorageProvider {
  readonly name = "null";
  readonly configured = false;
  async createSignedUploadUrl(input: CreateSignedUploadInput): Promise<SignedUpload> {
    void input;
    throw new StorageNotConfiguredError();
  }
  async createSignedDownloadUrl(storageKey: string): Promise<string> {
    void storageKey;
    throw new StorageNotConfiguredError();
  }
  getObjectUrl(storageKey: string): string {
    // Best-effort delivery URL even when upload isn't configured.
    const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    return base ? `${base}/${storageKey}` : `/media/${storageKey}`;
  }
  async headObject(storageKey: string): Promise<ObjectHead> {
    void storageKey;
    throw new StorageNotConfiguredError();
  }
  async deleteObject(storageKey: string): Promise<void> {
    void storageKey;
    throw new StorageNotConfiguredError();
  }
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const cfg = readS3Config();
  cached = cfg ? new S3StorageProvider(cfg) : new NullStorageProvider();
  return cached;
}

/** Test seam: reset the memoized provider (used after env changes in tests). */
export function __resetStorageProvider() {
  cached = null;
}

export { StorageNotConfiguredError };
export type { StorageProvider, SignedUpload, ObjectHead } from "./types";
