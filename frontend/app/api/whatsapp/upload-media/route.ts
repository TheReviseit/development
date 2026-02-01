/**
 * WhatsApp Upload Media API Route (with Cloudflare R2 Persistence)
 *
 * Flow:
 * 1. Upload file to Cloudflare R2 (persistent storage - source of truth)
 * 2. Upload file to WhatsApp Cloud API (delivery only)
 * 3. Return R2 URL + WhatsApp media_id
 *
 * Features:
 * - SHA-256 hash for deduplication
 * - Idempotent uploads (same message_id = same R2 key)
 * - CDN cache headers for performance
 * - R2 URLs persist forever, WhatsApp URLs expire
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  getFacebookAccountByUserId,
  getPrimaryPhoneNumber,
} from "@/lib/supabase/facebook-whatsapp-queries";
import { createGraphAPIClient } from "@/lib/facebook/graph-api-client";
import { decryptToken } from "@/lib/encryption/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  uploadToR2,
  isR2Configured,
  getR2ConfigStatus,
  FILE_SIZE_LIMITS,
} from "@/lib/cloudflare/r2-client";
import { v4 as uuidv4 } from "uuid";

// Allowed MIME types by category
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/3gpp"],
  audio: [
    "audio/aac",
    "audio/mp4",
    "audio/mpeg",
    "audio/amr",
    "audio/ogg",
    "audio/opus",
  ],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ],
};

/**
 * Get media type from MIME type
 */
function getMediaType(
  mimeType: string,
): "image" | "video" | "audio" | "document" | null {
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimeType)) {
      return type as "image" | "video" | "audio" | "document";
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const phoneNumberId = formData.get("phoneNumberId") as string | null;
    const conversationId = formData.get("conversationId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required for media upload" },
        { status: 400 },
      );
    }

    // Validate MIME type
    const mimeType = file.type;
    const mediaType = getMediaType(mimeType);

    if (!mediaType) {
      return NextResponse.json(
        {
          error: "Unsupported file type",
          message: `File type "${mimeType}" is not supported. Supported types: images (JPEG, PNG, WebP), videos (MP4, 3GPP), audio (AAC, MP4, MPEG, AMR, OGG), and documents (PDF, Word, Excel, PowerPoint, text).`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    const maxSize = FILE_SIZE_LIMITS[mediaType];
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        {
          error: "File too large",
          message: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} files must be under ${maxSizeMB} MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
        },
        { status: 400 },
      );
    }

    // Get Facebook account
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        {
          error: "WhatsApp not connected",
          message: "Please connect your WhatsApp Business Account first",
        },
        { status: 400 },
      );
    }

    // Get phone number to use
    const phoneNumber = phoneNumberId
      ? await (async () => {
          const { getPhoneNumberByPhoneNumberId } =
            await import("@/lib/supabase/facebook-whatsapp-queries");
          return getPhoneNumberByPhoneNumberId(phoneNumberId);
        })()
      : await getPrimaryPhoneNumber(user.id);

    if (!phoneNumber) {
      return NextResponse.json(
        {
          error: "No phone number available",
          message: "Please connect a WhatsApp Business phone number",
        },
        { status: 400 },
      );
    }

    // Verify user owns this phone number
    if (phoneNumber.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized - phone number belongs to another user" },
        { status: 403 },
      );
    }

    // Get business_id for R2 path
    const { data: businessManager } = await supabaseAdmin
      .from("connected_business_managers")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!businessManager) {
      return NextResponse.json(
        { error: "No business account found" },
        { status: 400 },
      );
    }

    const businessId = businessManager.id;

    // Generate a unique message_id for this upload (used as R2 key)
    const messageId = uuidv4();

    // Convert File to ArrayBuffer for R2 upload
    const fileBuffer = await file.arrayBuffer();

    // ============================================
    // STEP 1: Upload to Cloudflare R2 (Persistent)
    // ============================================
    let r2Result = null;

    if (isR2Configured()) {
      console.log("☁️ [R2] Uploading to Cloudflare R2...");
      r2Result = await uploadToR2({
        file: fileBuffer,
        businessId,
        conversationId,
        messageId,
        mimeType,
        filename: file.name,
      });

      if (!r2Result.success) {
        console.error("❌ [R2] Upload failed:", r2Result.error);
        return NextResponse.json(
          {
            error: "Failed to upload to storage",
            message: r2Result.error || "R2 upload failed",
          },
          { status: 500 },
        );
      }

      console.log("✅ [R2] Upload successful:", r2Result.mediaUrl);
    } else {
      console.warn("⚠️ [R2] Not configured, skipping R2 upload");
      console.warn("⚠️ [R2] Config status:", getR2ConfigStatus());
    }

    // ============================================
    // STEP 2: Upload to WhatsApp Cloud API
    // ============================================
    console.log("📱 [WhatsApp] Uploading to WhatsApp Cloud API...");
    const accessToken = decryptToken(facebookAccount.access_token);
    const graphClient = createGraphAPIClient(accessToken);

    // Create a new Blob from the ArrayBuffer (WhatsApp API needs Blob)
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    const uploadResult = await graphClient.uploadMedia(
      phoneNumber.phone_number_id,
      fileBlob,
      mimeType,
      file.name,
    );

    console.log("✅ [WhatsApp] Upload successful:", uploadResult.id);

    // ============================================
    // Return combined result
    // ============================================
    return NextResponse.json({
      success: true,
      data: {
        // Message identifier (used for DB storage)
        messageId,

        // WhatsApp delivery data
        whatsappMediaId: uploadResult.id,

        // R2 persistent storage data (source of truth for UI)
        mediaUrl: r2Result?.mediaUrl || null,
        mediaKey: r2Result?.mediaKey || null,
        mediaHash: r2Result?.mediaHash || null,
        mediaSize: r2Result?.mediaSize || file.size,
        mediaMime: mimeType,
        storageProvider: r2Result ? "cloudflare_r2" : null,

        // Legacy compatibility
        mediaId: uploadResult.id,
        mediaType,
        mimeType,
        filename: file.name,
        fileSize: file.size,
        phoneNumberId: phoneNumber.phone_number_id,
      },
    });
  } catch (error: any) {
    console.error("Error uploading media:", error);

    return NextResponse.json(
      {
        error: "Failed to upload media",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
