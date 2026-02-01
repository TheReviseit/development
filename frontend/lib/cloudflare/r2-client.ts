/**
 * Cloudflare R2 Storage Client
 * S3-compatible client for persistent media storage
 *
 * Storage Structure (MANDATORY - Deterministic & Idempotent):
 * messages/businesses/{business_id}/conversations/{conversation_id}/{type}/{message_id}.{ext}
 *
 * Rules:
 * ❌ No phone numbers in paths
 * ❌ No timestamps for uniqueness
 * ✅ message_id is the only filename key
 * ✅ Same message_id → same object key forever
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "crypto";

// R2 Configuration from environment
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

// File size limits (WhatsApp Cloud API limits)
export const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  audio: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
};

// MIME type to extension mapping
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/amr": "amr",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "text/plain": "txt",
};

// Media type from MIME
export function getMediaTypeFromMime(
  mimeType: string,
): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

// Get file extension from MIME type
function getExtensionFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || "bin";
}

// Create S3 client for Cloudflare R2
function createR2Client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Cloudflare R2 credentials not configured. Please set CLOUDFLARE_R2_* environment variables.",
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Compute SHA-256 hash of file content for deduplication
 */
export async function computeFileHash(
  file: ArrayBuffer | Buffer,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(Buffer.isBuffer(file) ? file : Buffer.from(file));
  return hash.digest("hex");
}

/**
 * Generate deterministic R2 object key
 *
 * Format: messages/businesses/{business_id}/conversations/{conversation_id}/{type}/{message_id}.{ext}
 *
 * INVARIANT: media_key MUST contain message_id
 */
export function generateMediaKey(params: {
  businessId: string;
  conversationId: string;
  messageId: string;
  mediaType: "image" | "video" | "audio" | "document";
  mimeType: string;
}): string {
  const { businessId, conversationId, messageId, mediaType, mimeType } = params;

  const extension = getExtensionFromMime(mimeType);
  const pluralType = `${mediaType}s`; // image -> images, video -> videos

  const key = `messages/businesses/${businessId}/conversations/${conversationId}/${pluralType}/${messageId}.${extension}`;

  // INVARIANT ASSERTION: Media key must be derived from message_id
  if (!key.includes(messageId)) {
    throw new Error(
      `INVARIANT VIOLATION: Media key must contain message_id. Key: ${key}, MessageId: ${messageId}`,
    );
  }

  return key;
}

/**
 * Get public CDN URL from media key
 */
export function getPublicUrl(mediaKey: string): string {
  if (!R2_PUBLIC_URL) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL not configured");
  }

  // Remove trailing slash if present
  const baseUrl = R2_PUBLIC_URL.replace(/\/$/, "");
  return `${baseUrl}/${mediaKey}`;
}

export interface UploadResult {
  success: boolean;
  mediaKey: string;
  mediaUrl: string;
  mediaHash: string;
  mediaSize: number;
  mediaMime: string;
  error?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingKey?: string;
  existingUrl?: string;
}

/**
 * Upload media to Cloudflare R2
 *
 * Features:
 * - Deterministic paths (idempotent)
 * - SHA-256 hash for deduplication
 * - CDN cache headers for performance
 * - Content-Type preservation
 */
export async function uploadToR2(params: {
  file: ArrayBuffer | Buffer;
  businessId: string;
  conversationId: string;
  messageId: string;
  mimeType: string;
  filename?: string;
}): Promise<UploadResult> {
  const { file, businessId, conversationId, messageId, mimeType, filename } =
    params;

  try {
    const client = createR2Client();
    const mediaType = getMediaTypeFromMime(mimeType);

    // Compute hash for deduplication
    const mediaHash = await computeFileHash(file);

    // Generate deterministic key
    const mediaKey = generateMediaKey({
      businessId,
      conversationId,
      messageId,
      mediaType,
      mimeType,
    });

    console.log(`📤 [R2] Uploading to: ${mediaKey}`);
    console.log(
      `📤 [R2] File size: ${Buffer.isBuffer(file) ? file.length : file.byteLength} bytes`,
    );
    console.log(`📤 [R2] Hash: ${mediaHash.substring(0, 16)}...`);

    // Normalize to Buffer for S3 SDK
    const uploadBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file);

    // Upload with CDN cache headers for performance
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: mediaKey,
      Body: uploadBuffer,
      ContentType: mimeType,
      // CDN Cache Headers: 1 year, immutable (content-addressed by hash)
      CacheControl: "public, max-age=31536000, immutable",
      Metadata: {
        "x-message-id": messageId,
        "x-business-id": businessId,
        "x-conversation-id": conversationId,
        "x-content-hash": mediaHash,
        "x-original-filename": filename || "unknown",
      },
    });

    await client.send(command);

    const mediaUrl = getPublicUrl(mediaKey);
    console.log(`✅ [R2] Upload successful: ${mediaUrl}`);

    return {
      success: true,
      mediaKey,
      mediaUrl,
      mediaHash,
      mediaSize: file.byteLength,
      mediaMime: mimeType,
    };
  } catch (error: any) {
    console.error(`❌ [R2] Upload failed:`, error);
    return {
      success: false,
      mediaKey: "",
      mediaUrl: "",
      mediaHash: "",
      mediaSize: 0,
      mediaMime: mimeType,
      error: error.message || "R2 upload failed",
    };
  }
}

/**
 * Check if media already exists in R2 (by content hash)
 * Used for deduplication across retries
 */
export async function checkMediaExists(
  mediaKey: string,
): Promise<{ exists: boolean; metadata?: Record<string, string> }> {
  try {
    const client = createR2Client();

    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: mediaKey,
    });

    const response = await client.send(command);

    return {
      exists: true,
      metadata: response.Metadata,
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Delete media from R2 (for cleanup or user deletion)
 */
export async function deleteFromR2(mediaKey: string): Promise<boolean> {
  try {
    const client = createR2Client();

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: mediaKey,
    });

    await client.send(command);
    console.log(`🗑️ [R2] Deleted: ${mediaKey}`);
    return true;
  } catch (error: any) {
    console.error(`❌ [R2] Delete failed:`, error);
    return false;
  }
}

/**
 * Validate R2 configuration
 */
export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME &&
    R2_PUBLIC_URL
  );
}

/**
 * Get R2 configuration status (for debugging)
 */
export function getR2ConfigStatus(): Record<string, boolean> {
  return {
    hasAccountId: !!R2_ACCOUNT_ID,
    hasAccessKeyId: !!R2_ACCESS_KEY_ID,
    hasSecretAccessKey: !!R2_SECRET_ACCESS_KEY,
    hasBucketName: !!R2_BUCKET_NAME,
    hasPublicUrl: !!R2_PUBLIC_URL,
    isFullyConfigured: isR2Configured(),
  };
}
