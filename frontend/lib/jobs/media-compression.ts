/**
 * Async Media Compression Job
 *
 * Generates thumbnails and previews for dashboard display.
 *
 * CRITICAL RULES:
 * ❌ Does NOT affect WhatsApp send path
 * ❌ Does NOT compress before WhatsApp upload
 * ❌ Does NOT block message send
 * ✅ Dashboard optimization ONLY
 * ✅ Fire-and-forget, failures are silent
 * ✅ Idempotent by wamid
 */

import sharp from "sharp";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/server";

// R2 Configuration
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

// Feature flag
const ENABLE_THUMBNAIL_GENERATION =
  process.env.ENABLE_THUMBNAIL_GENERATION !== "false"; // Default: enabled

// Compression targets
const THUMBNAIL_WIDTH = 300;
const PREVIEW_WIDTH = 800;
const WEBP_QUALITY = 75;

// Supported image types for compression
const COMPRESSIBLE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Create R2 client
 */
function createR2Client(): S3Client {
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
 * Derive thumbnail/preview key from original key
 *
 * Input:  messages/.../images/{id}.jpg
 * Output: messages/.../images/{id}_thumb.webp
 */
function deriveThumbnailKey(originalKey: string): string {
  const lastDot = originalKey.lastIndexOf(".");
  const basePath = originalKey.substring(0, lastDot);
  return `${basePath}_thumb.webp`;
}

function derivePreviewKey(originalKey: string): string {
  const lastDot = originalKey.lastIndexOf(".");
  const basePath = originalKey.substring(0, lastDot);
  return `${basePath}_preview.webp`;
}

/**
 * Get public URL from key
 */
function getPublicUrl(key: string): string {
  const baseUrl = R2_PUBLIC_URL.replace(/\/$/, "");
  return `${baseUrl}/${key}`;
}

/**
 * Compress image to WebP at target width
 */
async function compressToWebP(
  buffer: Buffer,
  targetWidth: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Skip if source is smaller than target
    if (!metadata.width || metadata.width <= targetWidth) {
      console.log(
        `⏭️ [Compression] Skipping - source width ${metadata.width}px <= target ${targetWidth}px`,
      );
      return null;
    }

    const result = await image
      .resize({
        width: targetWidth,
        height: undefined, // Auto-calculate
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: WEBP_QUALITY,
        effort: 4, // Balance speed/compression
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: result.data,
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    console.error(`❌ [Compression] Sharp error:`, error);
    return null;
  }
}

/**
 * Upload compressed image to R2
 */
async function uploadCompressed(
  client: S3Client,
  key: string,
  buffer: Buffer,
): Promise<boolean> {
  try {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });

    await client.send(command);
    console.log(`✅ [Compression] Uploaded: ${key}`);
    return true;
  } catch (error) {
    console.error(`❌ [Compression] Upload failed for ${key}:`, error);
    return false;
  }
}

/**
 * Update message record with thumbnail/preview URLs
 * Idempotent: only updates if columns are NULL
 */
async function updateMessageUrls(
  wamid: string,
  thumbnailUrl: string | null,
  previewUrl: string | null,
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("whatsapp_messages")
      .update({
        thumbnail_url: thumbnailUrl,
        preview_url: previewUrl,
      })
      .eq("wamid", wamid)
      .is("thumbnail_url", null); // Idempotent guard

    if (error) {
      console.error(`❌ [Compression] DB update failed:`, error);
      return false;
    }

    console.log(`✅ [Compression] DB updated for wamid: ${wamid.slice(-8)}`);
    return true;
  } catch (error) {
    console.error(`❌ [Compression] DB error:`, error);
    return false;
  }
}

export interface CompressionJobParams {
  wamid: string;
  mediaKey: string;
  mimeType: string;
}

/**
 * Queue compression job (fire-and-forget)
 *
 * Called after R2 storage completes.
 * Generates thumbnail + preview, uploads to R2, updates DB.
 *
 * IMPORTANT: This is async and non-blocking.
 * Failures are logged but do not affect the user.
 */
export function queueCompressionJob(params: CompressionJobParams): void {
  // Check feature flag
  if (!ENABLE_THUMBNAIL_GENERATION) {
    console.log(`⏭️ [Compression] Disabled by feature flag`);
    return;
  }

  // Check if mime type is compressible
  if (!COMPRESSIBLE_MIME_TYPES.includes(params.mimeType)) {
    console.log(`⏭️ [Compression] Skipping non-image: ${params.mimeType}`);
    return;
  }

  // Check R2 config
  if (!R2_ACCOUNT_ID || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    console.log(`⏭️ [Compression] R2 not configured`);
    return;
  }

  // Fire-and-forget
  (async () => {
    const startTime = Date.now();
    console.log(
      `🔄 [Compression] Starting for wamid: ${params.wamid.slice(-8)}`,
    );

    try {
      const client = createR2Client();

      // Step 1: Fetch original from R2
      console.log(`📥 [Compression] Fetching original: ${params.mediaKey}`);
      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: params.mediaKey,
      });

      const response = await client.send(getCommand);
      const originalBuffer = Buffer.from(
        await response.Body!.transformToByteArray(),
      );
      console.log(
        `📥 [Compression] Original size: ${originalBuffer.length} bytes`,
      );

      // Step 2: Generate thumbnail (300px)
      let thumbnailUrl: string | null = null;
      const thumbResult = await compressToWebP(originalBuffer, THUMBNAIL_WIDTH);
      if (thumbResult) {
        const thumbKey = deriveThumbnailKey(params.mediaKey);
        const uploaded = await uploadCompressed(
          client,
          thumbKey,
          thumbResult.buffer,
        );
        if (uploaded) {
          thumbnailUrl = getPublicUrl(thumbKey);
          console.log(
            `🖼️ [Compression] Thumbnail: ${thumbResult.width}x${thumbResult.height}, ${thumbResult.buffer.length} bytes`,
          );
        }
      }

      // Step 3: Generate preview (800px)
      let previewUrl: string | null = null;
      const previewResult = await compressToWebP(originalBuffer, PREVIEW_WIDTH);
      if (previewResult) {
        const previewKey = derivePreviewKey(params.mediaKey);
        const uploaded = await uploadCompressed(
          client,
          previewKey,
          previewResult.buffer,
        );
        if (uploaded) {
          previewUrl = getPublicUrl(previewKey);
          console.log(
            `🖼️ [Compression] Preview: ${previewResult.width}x${previewResult.height}, ${previewResult.buffer.length} bytes`,
          );
        }
      }

      // Step 4: Update database (if we generated anything)
      if (thumbnailUrl || previewUrl) {
        await updateMessageUrls(params.wamid, thumbnailUrl, previewUrl);
      }

      const elapsed = Date.now() - startTime;
      console.log(
        `✅ [Compression] Complete in ${elapsed}ms for wamid: ${params.wamid.slice(-8)}`,
      );
    } catch (error) {
      console.error(
        `❌ [Compression] Failed for wamid: ${params.wamid}`,
        error,
      );
      // Silent failure - dashboard will fall back to original
    }
  })();
}
