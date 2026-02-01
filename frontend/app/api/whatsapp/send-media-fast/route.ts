/**
 * WhatsApp Fast Media Send API Route
 *
 * CRITICAL CONTRACT:
 * - Returns SUCCESS = WhatsApp accepted the message
 * - Does NOT mean message is stored in DB or R2
 * - Storage happens async in background
 *
 * PERFORMANCE TARGET: 3-5 seconds (vs 10-15s before)
 *
 * Flow:
 * 1. Upload file directly to WhatsApp Cloud API
 * 2. Send media message via WhatsApp
 * 3. Return success immediately
 * 4. Queue background job for R2 + DB storage
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

// File size limits (WhatsApp limits)
const FILE_SIZE_LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  audio: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
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

/**
 * Queue background storage job
 * Uses fire-and-forget pattern with error logging
 *
 * IDEMPOTENCY: Uses wamid as unique key to prevent duplicates
 */
async function queueStorageJob(params: {
  wamid: string;
  conversationId: string;
  businessId: string;
  fileBuffer: ArrayBuffer;
  mimeType: string;
  filename: string;
  caption?: string;
  mediaType: string;
}) {
  // Fire-and-forget: start storage but don't await
  // This runs in the background after response is sent
  (async () => {
    const startTime = Date.now();
    console.log(
      `🔄 [Background] Starting storage for wamid: ${params.wamid.slice(-8)}`,
    );

    try {
      // Import modules dynamically to avoid blocking main thread
      const { uploadToR2, isR2Configured } =
        await import("@/lib/cloudflare/r2-client");
      const { compressForStorage, formatSize } =
        await import("@/lib/compression/compress-for-storage");

      let r2Url: string | null = null;
      let r2Key: string | null = null;
      let r2Hash: string | null = null;

      // Step 1: Upload to R2 if configured
      if (isR2Configured()) {
        const messageId = uuidv4();

        // Step 1a: COMPRESS before storage (saves 80-90% on large images)
        // This happens AFTER WhatsApp send, so it doesn't affect send speed
        let fileToUpload: ArrayBuffer | Buffer = params.fileBuffer;
        let mimeToUpload = params.mimeType;

        if (params.mediaType === "image") {
          console.log(`🗜️ [Background] Compressing before R2 upload...`);
          const compressionResult = await compressForStorage(
            params.fileBuffer,
            params.mimeType,
          );

          if (compressionResult.wasCompressed) {
            fileToUpload = compressionResult.buffer;
            mimeToUpload = compressionResult.mimeType;
            console.log(
              `✅ [Background] Compressed: ${formatSize(compressionResult.originalSize)} → ${formatSize(compressionResult.compressedSize)} (saved ${compressionResult.savings.toFixed(1)}%)`,
            );
          } else {
            console.log(
              `⏭️ [Background] Compression skipped (already optimized)`,
            );
          }
        }

        // Step 1b: Upload (compressed if applicable)
        const r2Result = await uploadToR2({
          file: fileToUpload,
          businessId: params.businessId,
          conversationId: params.conversationId,
          messageId,
          mimeType: mimeToUpload,
          filename: params.filename,
        });

        if (r2Result.success) {
          r2Url = r2Result.mediaUrl || null;
          r2Key = r2Result.mediaKey || null;
          r2Hash = r2Result.mediaHash || null;
          console.log(
            `✅ [Background] R2 upload complete: ${r2Url?.slice(0, 50)}...`,
          );
        } else {
          console.error(`❌ [Background] R2 upload failed:`, r2Result.error);
        }
      }

      // Step 2: Store message in database (IDEMPOTENT by wamid)
      const { createMessage } =
        await import("@/lib/supabase/facebook-whatsapp-queries");

      // Check if message already exists (idempotency)
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id")
        .eq("wamid", params.wamid)
        .single();

      if (existing) {
        console.log(
          `⏭️ [Background] Message already exists, updating media_url only`,
        );
        // Update with R2 URL if we got one
        if (r2Url) {
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({
              media_url: r2Url,
              media_key: r2Key,
              media_hash: r2Hash,
              storage_provider: "cloudflare_r2",
            })
            .eq("wamid", params.wamid);
        }
      } else {
        // Create new message record
        await createMessage({
          conversation_id: params.conversationId,
          business_id: params.businessId,
          wamid: params.wamid,
          direction: "outbound",
          message_type: params.mediaType,
          content: params.caption || `[${params.mediaType}]`,
          status: "sent",
          is_ai_generated: false,
          media_url: r2Url || undefined,
          media_key: r2Key || undefined,
          media_hash: r2Hash || undefined,
          storage_provider: r2Url ? "cloudflare_r2" : undefined,
        });
        console.log(`✅ [Background] Message stored in DB`);
      }

      // Step 3: Update conversation stats
      const { data: current } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("total_messages, human_replies_count")
        .eq("id", params.conversationId)
        .single();

      if (current) {
        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            total_messages: (current.total_messages || 0) + 1,
            last_message_at: new Date().toISOString(),
            last_message_direction: "outbound",
            last_message_preview: (
              params.caption || `[${params.mediaType}]`
            ).slice(0, 100),
            human_replies_count: (current.human_replies_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.conversationId);
      }

      // Step 4: Queue thumbnail/preview generation (only for images)
      // This is fire-and-forget, runs AFTER storage completes
      if (r2Key && params.mediaType === "image") {
        const { queueCompressionJob } =
          await import("@/lib/jobs/media-compression");
        queueCompressionJob({
          wamid: params.wamid,
          mediaKey: r2Key,
          mimeType: params.mimeType,
        });
        console.log(
          `📷 [Background] Compression job queued for wamid: ${params.wamid.slice(-8)}`,
        );
      }

      const elapsed = Date.now() - startTime;
      console.log(
        `✅ [Background] Storage complete in ${elapsed}ms for wamid: ${params.wamid.slice(-8)}`,
      );
    } catch (error) {
      console.error(
        `❌ [Background] Storage failed for wamid: ${params.wamid}`,
        error,
      );
      // TODO: Add alerting (Slack webhook, etc.)
    }
  })();
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();

  try {
    // ============================================
    // AUTH VALIDATION (fast, ~50ms)
    // ============================================
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

    console.log(
      `⏱️ [send-media-fast] Auth validated in ${Date.now() - requestStartTime}ms`,
    );

    // ============================================
    // PARSE & VALIDATE REQUEST (~100ms)
    // ============================================
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const to = formData.get("to") as string | null;
    const caption = formData.get("caption") as string | null;
    const conversationId = formData.get("conversationId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!to) {
      return NextResponse.json(
        { error: "Recipient 'to' is required" },
        { status: 400 },
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
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
          message: `File type "${mimeType}" is not supported.`,
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
          message: `${mediaType} files must be under ${maxSizeMB} MB.`,
        },
        { status: 400 },
      );
    }

    console.log(
      `⏱️ [send-media-fast] Validation complete in ${Date.now() - requestStartTime}ms`,
    );

    // ============================================
    // GET CREDENTIALS (~100ms)
    // ============================================
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { error: "WhatsApp not connected" },
        { status: 400 },
      );
    }

    const phoneNumber = await getPrimaryPhoneNumber(user.id);
    if (!phoneNumber || !phoneNumber.is_active) {
      return NextResponse.json(
        { error: "No active phone number" },
        { status: 400 },
      );
    }

    // Get business_id
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
    const accessToken = decryptToken(facebookAccount.access_token);
    const graphClient = createGraphAPIClient(accessToken);

    console.log(
      `⏱️ [send-media-fast] Credentials loaded in ${Date.now() - requestStartTime}ms`,
    );

    // ============================================
    // CRITICAL PATH: WHATSAPP UPLOAD + SEND
    // This is the only blocking section (~3-5s)
    // ============================================
    const whatsappStartTime = Date.now();

    // Convert File to ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    const fileBlob = new Blob([fileBuffer], { type: mimeType });

    // Step 1: Upload media to WhatsApp
    console.log(`📱 [send-media-fast] Uploading to WhatsApp...`);
    const uploadResult = await graphClient.uploadMedia(
      phoneNumber.phone_number_id,
      fileBlob,
      mimeType,
      file.name,
    );
    const whatsappMediaId = uploadResult.id;
    console.log(
      `⏱️ [send-media-fast] WhatsApp upload done in ${Date.now() - whatsappStartTime}ms`,
    );

    // Step 2: Send media message
    console.log(`📤 [send-media-fast] Sending message...`);
    const sendResult = await graphClient.sendMediaMessage(
      phoneNumber.phone_number_id,
      to,
      mediaType as "image" | "video" | "document" | "audio",
      whatsappMediaId,
      caption || undefined,
      file.name,
    );
    const wamid = sendResult.messages[0].id;

    const totalWhatsAppTime = Date.now() - whatsappStartTime;
    console.log(
      `✅ [send-media-fast] WhatsApp complete in ${totalWhatsAppTime}ms (wamid: ${wamid.slice(-8)})`,
    );

    // ============================================
    // QUEUE BACKGROUND STORAGE (non-blocking)
    // ============================================
    queueStorageJob({
      wamid,
      conversationId,
      businessId,
      fileBuffer,
      mimeType,
      filename: file.name,
      caption: caption || undefined,
      mediaType,
    });

    // ============================================
    // RETURN SUCCESS IMMEDIATELY
    // ============================================
    const totalTime = Date.now() - requestStartTime;
    console.log(
      `🚀 [send-media-fast] Response sent in ${totalTime}ms (target: <5000ms)`,
    );

    return NextResponse.json({
      success: true,
      data: {
        messageId: wamid,
        whatsappMediaId,
        mediaType,
        // Note: storage is async, these may not be immediately available
        storageStatus: "queued",
      },
      timing: {
        totalMs: totalTime,
        whatsappMs: totalWhatsAppTime,
      },
    });
  } catch (error: any) {
    console.error("❌ [send-media-fast] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to send media",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
