import "server-only";
import { createHash, createHmac } from "node:crypto";
import type {
  CreateSignedUploadInput,
  ObjectHead,
  SignedUpload,
  StorageProvider,
} from "./types";

/**
 * Minimal S3-compatible (AWS SigV4) provider — works with Cloudflare R2 and any
 * S3 API. Implemented with Node crypto + fetch only (no SDK dependency), so the
 * dependency tree and lockfile stay unchanged. Path-style addressing is used,
 * which R2 supports: {endpoint}/{bucket}/{key}.
 *
 * Presigned uploads use query-string auth with UNSIGNED-PAYLOAD and sign only
 * the `host` header, so the browser can PUT with any Content-Type.
 */

export interface S3Config {
  endpoint: string; // e.g. https://<accountid>.r2.cloudflarestorage.com
  region: string; // e.g. "auto" (R2) or "us-east-1"
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string; // e.g. https://media.example.com  (delivery domain)
}

const SERVICE = "s3";
const ALGO = "AWS4-HMAC-SHA256";

/** RFC3986 URI-encode. `encodeSlash=false` keeps `/` for canonical paths. */
function uriEncode(input: string, encodeSlash = true): string {
  let out = "";
  for (const ch of Buffer.from(input, "utf8").toString("binary")) {
    if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "-" ||
      ch === "~" ||
      ch === "."
    ) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      out += "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const kDate = hmac("AWS4" + secret, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

/** amzDate = YYYYMMDDTHHMMSSZ, dateStamp = YYYYMMDD */
function timestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  readonly configured = true;
  private cfg: S3Config;
  private host: string;

  constructor(cfg: S3Config) {
    this.cfg = cfg;
    this.host = new URL(cfg.endpoint).host;
  }

  private objectPath(storageKey: string): string {
    // path-style: /{bucket}/{key} — each segment encoded, slashes preserved.
    return `/${uriEncode(this.cfg.bucket, false)}/${uriEncode(storageKey, false)}`;
  }

  private endpointBase(): string {
    return this.cfg.endpoint.replace(/\/+$/, "");
  }

  /** Build a presigned URL (query-string auth) for a method + object. */
  private presign(
    method: string,
    storageKey: string,
    expiresInSeconds: number,
    now = new Date(),
  ): string {
    const { amzDate, dateStamp } = timestamps(now);
    const credentialScope = `${dateStamp}/${this.cfg.region}/${SERVICE}/aws4_request`;
    const canonicalUri = this.objectPath(storageKey);

    const params: Record<string, string> = {
      "X-Amz-Algorithm": ALGO,
      "X-Amz-Credential": `${this.cfg.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresInSeconds),
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.keys(params)
      .sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
      .join("&");

    const canonicalHeaders = `host:${this.host}\n`;
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      ALGO,
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signature = createHmac(
      "sha256",
      signingKey(this.cfg.secretAccessKey, dateStamp, this.cfg.region),
    )
      .update(stringToSign, "utf8")
      .digest("hex");

    return `${this.endpointBase()}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  async createSignedUploadUrl(
    input: CreateSignedUploadInput,
  ): Promise<SignedUpload> {
    const expiresInSeconds = input.expiresInSeconds ?? 900; // 15 min TTL
    const uploadUrl = this.presign("PUT", input.storageKey, expiresInSeconds);
    return {
      method: "PUT",
      uploadUrl,
      storageKey: input.storageKey,
      expiresInSeconds,
      // host is the only signed header, so Content-Type is advisory (helps CDN).
      requiredHeaders: { "Content-Type": input.contentType },
    };
  }

  getObjectUrl(storageKey: string): string {
    const base = this.cfg.publicBaseUrl.replace(/\/+$/, "");
    return `${base}/${storageKey.split("/").map((s) => uriEncode(s)).join("/")}`;
  }

  async headObject(storageKey: string): Promise<ObjectHead> {
    const url = this.presign("HEAD", storageKey, 300);
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (!res.ok) return { exists: false, sizeBytes: null, mimeType: null };
      const len = res.headers.get("content-length");
      return {
        exists: true,
        sizeBytes: len ? Number(len) : null,
        mimeType: res.headers.get("content-type"),
      };
    } catch {
      return { exists: false, sizeBytes: null, mimeType: null };
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    const url = this.presign("DELETE", storageKey, 300);
    await fetch(url, { method: "DELETE" });
  }
}
