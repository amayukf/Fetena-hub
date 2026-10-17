import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * ExamVault Private Object Storage Adapter
 * -------------------------------------------------------------
 * Exam papers and payment screenshots are strictly private.
 * Direct public URLs are NEVER exposed to the client.
 * Allowed prefixes: "quarantine/" (seller uploads, payment screenshots)
 *                   "published/" (approved papers).
 */

export const ALLOWED_STORAGE_PREFIXES = ["quarantine/", "published/"] as const;
export type StoragePrefix = typeof ALLOWED_STORAGE_PREFIXES[number];

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export interface StorageAdapter {
  upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<{ key: string; size: number }>;
  download(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<boolean>;
  getSignedViewUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export function validateStorageKey(key: string): void {
  if (!key || typeof key !== "string") {
    throw new Error("Storage key is required.");
  }
  if (key.includes("..") || key.includes("\\")) {
    throw new Error("Path traversal characters (.. or \\) are strictly forbidden in storage keys.");
  }
  const hasValidPrefix = ALLOWED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!hasValidPrefix) {
    throw new Error(
      `Invalid storage prefix for key "${key}". Private storage permits only "quarantine/" and "published/" prefixes.`
    );
  }
}

export interface FileSignatureResult {
  valid: boolean;
  detectedMime?: AllowedMimeType;
  detectedExt?: "pdf" | "jpg" | "png";
  error?: string;
}

/**
 * Validates real file signature (magic bytes) to prevent disguised files (.exe renamed to .pdf, etc.)
 */
export function detectFileSignature(data: Buffer | Uint8Array): FileSignatureResult {
  if (!data || data.byteLength < 4) {
    return { valid: false, error: "File content is missing or too small to verify file signature." };
  }

  const bytes = data instanceof Buffer ? data : Buffer.from(data);

  // PDF signature: %PDF- (0x25 0x50 0x44 0x46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { valid: true, detectedMime: "application/pdf", detectedExt: "pdf" };
  }

  // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png", detectedExt: "png" };
  }

  // JPEG signature: 0xFF 0xD8 0xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg", detectedExt: "jpg" };
  }

  return {
    valid: false,
    error: "Invalid file format: Invalid file signature (magic bytes). Only authentic PDF, JPG, and PNG files are accepted.",
  };
}

/**
 * Validates file signature, MIME type, and size against system limits.
 * Supports both raw file buffer (checking magic bytes) and MIME/size signature.
 */
export function validateUploadFile(
  fileOrMime: Buffer | Uint8Array | string,
  reportedMimeOrSize: string | number = 0,
  maxMb = 20
): { valid: boolean; detectedMime?: AllowedMimeType; detectedExt?: "pdf" | "jpg" | "png"; error?: string } {
  // Legacy string-based overload: validateUploadFile(mimeType: string, sizeBytes: number, maxMb = 20)
  if (typeof fileOrMime === "string") {
    const mimeType = fileOrMime;
    const sizeBytes = typeof reportedMimeOrSize === "number" ? reportedMimeOrSize : 0;

    if (!ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType)) {
      return {
        valid: false,
        error: "Invalid file format. Only PDF, JPG, and PNG files are allowed.",
      };
    }

    const maxBytes = maxMb * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      return {
        valid: false,
        error: `File size exceeds the maximum allowed limit of ${maxMb} MB.`,
      };
    }

    const extMap: Record<AllowedMimeType, "pdf" | "jpg" | "png"> = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
    };

    return {
      valid: true,
      detectedMime: mimeType as AllowedMimeType,
      detectedExt: extMap[mimeType as AllowedMimeType],
    };
  }

  // Buffer overload: validates magic bytes + size + optional declared MIME
  const data = fileOrMime;
  const reportedMime = typeof reportedMimeOrSize === "string" ? reportedMimeOrSize : "";
  const maxBytes = maxMb * 1024 * 1024;

  if (data.byteLength > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the maximum allowed limit of ${maxMb} MB.`,
    };
  }

  const signature = detectFileSignature(data);
  if (!signature.valid || !signature.detectedMime) {
    return {
      valid: false,
      error: signature.error || "Invalid file format. Only PDF, JPG, and PNG files are allowed.",
    };
  }

  if (reportedMime) {
    const isEquivalent =
      reportedMime === signature.detectedMime ||
      (signature.detectedMime === "image/jpeg" && (reportedMime === "image/jpg" || reportedMime === "image/jpeg"));

    if (!isEquivalent) {
      return {
        valid: false,
        error: `File signature mismatch: header claimed "${reportedMime}" but magic bytes indicate "${signature.detectedMime}".`,
      };
    }
  }

  return {
    valid: true,
    detectedMime: signature.detectedMime,
    detectedExt: signature.detectedExt,
  };
}

/**
 * Generate randomized storage key (never includes user-supplied filename)
 */
export function generateRandomStorageKey(
  prefix: "quarantine" | "published",
  extension: string,
  subfolder?: string
): string {
  const uuid = crypto.randomUUID();
  const cleanExt = extension.replace(/^\./, "");
  if (subfolder) {
    return `${prefix}/${subfolder}/${uuid}.${cleanExt}`;
  }
  return `${prefix}/${uuid}.${cleanExt}`;
}

export function computeSha256(data: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function signStreamTicket(key: string, expiresAtMs: number, secret: string, userBinding?: string): string {
  const payload = userBinding ? `${key}:${userBinding}:${expiresAtMs}` : `${key}:${expiresAtMs}`;
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

export function verifyStreamTicket(key: string, expiresAtMs: number, signature: string, secret: string, userBinding?: string): boolean {
  if (!signature || typeof signature !== "string" || Date.now() > expiresAtMs) {
    return false;
  }
  if (userBinding) {
    const expectedWithUser = signStreamTicket(key, expiresAtMs, secret, userBinding);
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedWithUser, "hex");
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  const expected = signStreamTicket(key, expiresAtMs, secret);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Local disk storage adapter for development and testing.
 * Files are kept strictly in a private directory outside web root.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private secret: string;

  constructor(baseDir?: string, secret?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), "storage");
    const resolvedSecret = secret || process.env.SESSION_SECRET;
    if (!resolvedSecret || resolvedSecret.length < 32) {
      throw new Error(
        "FATAL: SESSION_SECRET (>= 32 characters) is required to sign private storage URLs."
      );
    }
    this.secret = resolvedSecret;
    this.ensureDirs();
  }

  private ensureDirs() {
    for (const prefix of ALLOWED_STORAGE_PREFIXES) {
      const dir = path.join(this.baseDir, prefix.replace(/\/$/, ""));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private resolvePath(key: string): string {
    validateStorageKey(key);
    return path.join(this.baseDir, key);
  }

  async upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<{ key: string; size: number }> {
    validateStorageKey(key);
    const fullPath = this.resolvePath(key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const buf = data instanceof Buffer ? data : Buffer.from(data);
    fs.writeFileSync(fullPath, buf);
    return { key, size: buf.byteLength };
  }

  async download(key: string): Promise<Uint8Array | null> {
    validateStorageKey(key);
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const buf = fs.readFileSync(fullPath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async delete(key: string): Promise<boolean> {
    validateStorageKey(key);
    const fullPath = this.resolvePath(key);
    if (!fs.existsSync(fullPath)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    return true;
  }

  async exists(key: string): Promise<boolean> {
    validateStorageKey(key);
    const fullPath = this.resolvePath(key);
    return fs.existsSync(fullPath);
  }

  async getSignedViewUrl(key: string, expiresInSeconds = 60): Promise<string> {
    validateStorageKey(key);
    // Enforce max 60 seconds expiration per specification
    const safeExpiresIn = Math.min(Math.max(1, expiresInSeconds), 60);
    const expiresAtMs = Date.now() + safeExpiresIn * 1000;
    const sig = signStreamTicket(key, expiresAtMs, this.secret);
    return `/api/storage/view?key=${encodeURIComponent(key)}&expires=${expiresAtMs}&sig=${sig}`;
  }
}

/**
 * Cloudflare R2 / S3-compatible private storage adapter.
 * Uses AWS SDK v3 with custom Cloudflare R2 endpoint.
 */
export class CloudflareR2StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor(config?: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    endpoint?: string;
  }) {
    const accountId = config?.accountId || process.env.R2_ACCOUNT_ID || process.env.S3_ACCOUNT_ID;
    const accessKeyId = config?.accessKeyId || process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || "";
    const secretAccessKey = config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || "";
    this.bucket = config?.bucketName || process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || "examvault-private";

    const endpoint =
      config?.endpoint ||
      process.env.R2_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const region = process.env.S3_REGION || process.env.R2_REGION || "auto";

    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async upload(key: string, data: Buffer | Uint8Array, mimeType: string): Promise<{ key: string; size: number }> {
    validateStorageKey(key);
    const buf = data instanceof Buffer ? data : Buffer.from(data);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buf,
        ContentType: mimeType,
      })
    );
    return { key, size: buf.byteLength };
  }

  async download(key: string): Promise<Uint8Array | null> {
    validateStorageKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      if (!response.Body) return null;
      const byteArray = await response.Body.transformToByteArray();
      return byteArray;
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<boolean> {
    validateStorageKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    validateStorageKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async getSignedViewUrl(key: string, expiresInSeconds = 60): Promise<string> {
    validateStorageKey(key);
    // Enforce 60 seconds maximum signed URL expiration
    const safeExpiresIn = Math.min(Math.max(1, expiresInSeconds), 60);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseCacheControl: "no-store",
    });
    return getSignedUrl(this.client, command, { expiresIn: safeExpiresIn });
  }
}

/**
 * Storage factory singleton
 */
let currentStorage: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (currentStorage) return currentStorage;

  const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
  const hasCreds = Boolean(
    (process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID) &&
    (process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY)
  );

  if (provider === "r2" || provider === "s3") {
    // SECURITY: never silently fall back to ephemeral local disk in a
    // cloud-storage deployment — private papers and receipts could be lost.
    if (!hasCreds) {
      throw new Error(
        `FATAL: STORAGE_PROVIDER="${provider}" requires S3/R2 credentials. Refusing to fall back to local disk storage.`
      );
    }
    currentStorage = new CloudflareR2StorageAdapter();
  } else {
    currentStorage = new LocalStorageAdapter();
  }

  return currentStorage;
}

export function setStorageAdapter(adapter: StorageAdapter): void {
  currentStorage = adapter;
}

export const storage = getStorageAdapter();
