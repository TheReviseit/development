/**
 * Storage Compression Module
 *
 * Compresses images BEFORE uploading to R2 to save storage costs.
 *
 * CRITICAL RULES:
 * ❌ Never store raw 4-5MB originals
 * ✅ Always compress before uploadToR2()
 * ✅ Store only ONE main image (media_url)
 * ✅ WhatsApp send path remains unchanged (uses original)
 *
 * Compression Strategy:
 * | Input           | Action              | Max Width | Quality | Output |
 * |-----------------|---------------------|-----------|---------|--------|
 * | JPEG > 2000px   | Resize + recompress | 1600px    | 80      | JPEG   |
 * | PNG > 2000px    | Convert → WebP      | 1600px    | 85      | WebP   |
 * | WebP > 2000px   | Resize              | 1600px    | 85      | WebP   |
 * | Any ≤ 2000px    | Passthrough         | –         | –       | Original|
 * | File < 200KB    | Skip compression    | –         | –       | Original|
 */

import sharp from "sharp";

// Compression configuration
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 85;
const MIN_SIZE_FOR_COMPRESSION = 200 * 1024; // 200KB - skip tiny files
const MIN_WIDTH_FOR_COMPRESSION = 2000; // Only resize if > 2000px

// Supported image MIME types for compression
const COMPRESSIBLE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface CompressionResult {
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
  width?: number;
  height?: number;
  savings: number; // percentage saved
}

/**
 * Compress image for R2 storage
 *
 * Called AFTER WhatsApp send, BEFORE uploadToR2().
 *
 * @param buffer - Original file buffer
 * @param mimeType - Original MIME type
 * @returns Compressed buffer with metadata
 */
export async function compressForStorage(
  buffer: Buffer | ArrayBuffer,
  mimeType: string,
): Promise<CompressionResult> {
  const inputBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const originalSize = inputBuffer.length;

  // Default result (passthrough)
  const passthroughResult: CompressionResult = {
    buffer: inputBuffer,
    mimeType,
    originalSize,
    compressedSize: originalSize,
    wasCompressed: false,
    savings: 0,
  };

  // RULE 1: Skip non-image types
  if (!COMPRESSIBLE_MIME_TYPES.includes(mimeType)) {
    console.log(`⏭️ [CompressForStorage] Skipping non-image: ${mimeType}`);
    return passthroughResult;
  }

  // RULE 2: Skip tiny files (compression overhead > savings)
  if (originalSize < MIN_SIZE_FOR_COMPRESSION) {
    console.log(
      `⏭️ [CompressForStorage] Skipping small file: ${(originalSize / 1024).toFixed(1)}KB < 200KB`,
    );
    return passthroughResult;
  }

  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    console.log(
      `📊 [CompressForStorage] Input: ${mimeType}, ${(originalSize / 1024 / 1024).toFixed(2)}MB, ${originalWidth}x${originalHeight}`,
    );

    // RULE 3: Skip if already small enough (width ≤ 2000px AND size < 500KB)
    if (
      originalWidth <= MIN_WIDTH_FOR_COMPRESSION &&
      originalSize < 500 * 1024
    ) {
      console.log(
        `⏭️ [CompressForStorage] Already optimized: ${originalWidth}px, ${(originalSize / 1024).toFixed(1)}KB`,
      );
      return passthroughResult;
    }

    // Determine output format and compression settings
    let compressedBuffer: Buffer;
    let outputMimeType: string;

    if (mimeType === "image/png") {
      // PNG → WebP (much smaller)
      compressedBuffer = await image
        .resize({
          width: MAX_WIDTH,
          height: undefined,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: WEBP_QUALITY,
          effort: 4,
        })
        .toBuffer();
      outputMimeType = "image/webp";
    } else if (mimeType === "image/webp") {
      // WebP → WebP (re-compress)
      compressedBuffer = await image
        .resize({
          width: MAX_WIDTH,
          height: undefined,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: WEBP_QUALITY,
          effort: 4,
        })
        .toBuffer();
      outputMimeType = "image/webp";
    } else {
      // JPEG → JPEG (MozJPEG for best compression)
      compressedBuffer = await image
        .resize({
          width: MAX_WIDTH,
          height: undefined,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: JPEG_QUALITY,
          mozjpeg: true, // Use MozJPEG encoder for better compression
        })
        .toBuffer();
      outputMimeType = "image/jpeg";
    }

    // Get final dimensions
    const finalMetadata = await sharp(compressedBuffer).metadata();
    const compressedSize = compressedBuffer.length;
    const savings = ((originalSize - compressedSize) / originalSize) * 100;

    console.log(
      `✅ [CompressForStorage] Output: ${outputMimeType}, ${(compressedSize / 1024).toFixed(1)}KB, ${finalMetadata.width}x${finalMetadata.height}, saved ${savings.toFixed(1)}%`,
    );

    // SAFETY: Only use compressed if it's actually smaller
    if (compressedSize >= originalSize) {
      console.log(
        `⚠️ [CompressForStorage] Compressed larger than original, using original`,
      );
      return passthroughResult;
    }

    return {
      buffer: compressedBuffer,
      mimeType: outputMimeType,
      originalSize,
      compressedSize,
      wasCompressed: true,
      width: finalMetadata.width,
      height: finalMetadata.height,
      savings,
    };
  } catch (error) {
    console.error(
      `❌ [CompressForStorage] Sharp error, using original:`,
      error,
    );
    // FALLBACK: On any error, use original (user never sees failure)
    return passthroughResult;
  }
}

/**
 * Get human-readable size string
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}
