/**
 * Download Inbound Media API Route (WORLD-CLASS VERSION)
 *
 * Downloads media from WhatsApp Cloud API and uploads to Cloudflare R2
 * for persistent storage. This is called when displaying inbound media
 * messages that only have media_id but no media_url.
 *
 * IDEMPOTENT DESIGN (like Slack):
 * - Uses DB-level lock with media_fetch_status column
 * - Prevents concurrent downloads of the same media
 * - Status transitions: pending → fetching → ready/failed
 *
 * Flow:
 * 1. Acquire DB lock (atomic UPDATE WHERE status = 'pending')
 * 2. Get media URL from WhatsApp using media_id
 * 3. Download media content from WhatsApp
 * 4. Upload to Cloudflare R2 (persistent storage)
 * 5. Update database with R2 URL + status = 'ready'
 * 6. Return the persistent R2 URL
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { getFacebookAccountByUserId } from "@/lib/supabase/facebook-whatsapp-queries";
import { decryptToken } from "@/lib/encryption/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2, isR2Configured } from "@/lib/cloudflare/r2-client";
import { v4 as uuidv4 } from "uuid";

// MIME type extensions
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

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

    // Parse request body
    const body = await request.json();
    const { mediaId, messageId, conversationId } = body;

    if (!mediaId) {
      return NextResponse.json(
        { error: "mediaId is required" },
        { status: 400 },
      );
    }

    if (!messageId || !conversationId) {
      return NextResponse.json(
        { error: "messageId and conversationId are required" },
        { status: 400 },
      );
    }

    // ============================================
    // STEP 0: Check current status + return cached if ready
    // ============================================
    const { data: existingMessage } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("media_url, media_key, media_fetch_status")
      .eq("id", messageId)
      .single();

    // If already ready, return immediately
    if (
      existingMessage?.media_url &&
      existingMessage?.media_fetch_status === "ready"
    ) {
      console.log("✅ [Cache] Media already processed, returning existing URL");
      return NextResponse.json({
        success: true,
        data: {
          mediaUrl: existingMessage.media_url,
          mediaKey: existingMessage.media_key,
          cached: true,
          status: "ready",
        },
      });
    }

    // If currently being fetched by another request, return "in_progress"
    if (existingMessage?.media_fetch_status === "fetching") {
      console.log("⏳ [Lock] Media is being fetched by another request");
      return NextResponse.json(
        {
          success: false,
          error: "Media is being fetched",
          status: "in_progress",
          retry: true,
        },
        { status: 202 },
      ); // 202 Accepted - processing
    }

    // If failed, we could retry - but for now just report failure
    if (existingMessage?.media_fetch_status === "failed") {
      console.log("❌ [Status] Previous fetch failed");
      // Allow retry by proceeding below
    }

    // ============================================
    // STEP 1: Acquire DB lock (atomic)
    // ============================================
    console.log("🔒 [Lock] Attempting to acquire fetch lock...");

    const { data: lockAcquired, error: lockError } = await supabaseAdmin
      .from("whatsapp_messages")
      .update({ media_fetch_status: "fetching" })
      .eq("id", messageId)
      .in("media_fetch_status", ["pending", "failed"]) // Only acquire if pending or failed
      .select("id")
      .single();

    if (lockError || !lockAcquired) {
      // Someone else acquired the lock OR status is already 'fetching'
      console.log(
        "⚠️ [Lock] Failed to acquire lock - another process is handling this",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Another request is processing this media",
          status: "in_progress",
          retry: true,
        },
        { status: 202 },
      );
    }

    console.log("✅ [Lock] Lock acquired for message:", messageId);

    // Wrap the rest in try-finally to ensure we release the lock on failure
    try {
      // Get Facebook account for access token
      const facebookAccount = await getFacebookAccountByUserId(user.id);
      if (!facebookAccount) {
        throw new Error("WhatsApp not connected");
      }

      const accessToken = decryptToken(facebookAccount.access_token);

      // Get business_id for R2 path
      const { data: businessManager } = await supabaseAdmin
        .from("connected_business_managers")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();

      if (!businessManager) {
        throw new Error("No business account found");
      }

      const businessId = businessManager.id;

      // ============================================
      // STEP 2: Get media URL from WhatsApp
      // ============================================
      console.log(`📱 [WhatsApp] Getting media URL for: ${mediaId}`);

      const mediaInfoResponse = await fetch(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!mediaInfoResponse.ok) {
        const error = await mediaInfoResponse.text();
        console.error("❌ [WhatsApp] Failed to get media info:", error);
        throw new Error(`Failed to get media info from WhatsApp: ${error}`);
      }

      const mediaInfo = await mediaInfoResponse.json();
      const downloadUrl = mediaInfo.url;
      const mimeType = mediaInfo.mime_type || "application/octet-stream";

      if (!downloadUrl) {
        throw new Error("No download URL available from WhatsApp");
      }

      // ============================================
      // STEP 3: Download media content from WhatsApp
      // ============================================
      console.log(`📥 [WhatsApp] Downloading media from WhatsApp...`);

      const mediaResponse = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!mediaResponse.ok) {
        throw new Error("Failed to download media from WhatsApp");
      }

      const mediaBuffer = await mediaResponse.arrayBuffer();
      console.log(`✅ [WhatsApp] Downloaded ${mediaBuffer.byteLength} bytes`);

      // ============================================
      // STEP 4: Upload to Cloudflare R2
      // ============================================
      if (!isR2Configured()) {
        throw new Error("Media storage not configured");
      }

      console.log("☁️ [R2] Uploading to Cloudflare R2...");

      const r2MessageId = messageId || uuidv4();
      const ext = MIME_EXTENSIONS[mimeType] || "bin";

      const r2Result = await uploadToR2({
        file: mediaBuffer,
        businessId,
        conversationId,
        messageId: r2MessageId,
        mimeType,
        filename: `inbound_${r2MessageId}.${ext}`,
      });

      if (!r2Result.success) {
        throw new Error(`R2 upload failed: ${r2Result.error}`);
      }

      console.log("✅ [R2] Upload successful:", r2Result.mediaUrl);

      // ============================================
      // STEP 5: Update database with R2 URL + mark as ready
      // ============================================
      console.log("💾 [DB] Updating message with R2 URL...");

      const { error: updateError } = await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          media_url: r2Result.mediaUrl,
          media_key: r2Result.mediaKey,
          media_hash: r2Result.mediaHash,
          media_size: r2Result.mediaSize,
          media_mime: mimeType,
          storage_provider: "cloudflare_r2",
          media_fetch_status: "ready", // SUCCESS - mark as ready
        })
        .eq("id", messageId);

      if (updateError) {
        console.error("❌ [DB] Failed to update message:", updateError);
      } else {
        console.log("✅ [DB] Message updated with R2 URL, status = ready");
      }

      // ============================================
      // Return result
      // ============================================
      return NextResponse.json({
        success: true,
        data: {
          mediaUrl: r2Result.mediaUrl,
          mediaKey: r2Result.mediaKey,
          mediaHash: r2Result.mediaHash,
          mediaSize: r2Result.mediaSize,
          mediaMime: mimeType,
          cached: false,
          status: "ready",
        },
      });
    } catch (fetchError: any) {
      // ============================================
      // ON FAILURE: Mark as failed to release lock
      // ============================================
      console.error("❌ [Fetch] Error during media fetch:", fetchError.message);

      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ media_fetch_status: "failed" })
        .eq("id", messageId);

      return NextResponse.json(
        {
          error: "Failed to process media",
          message: fetchError.message || "An unexpected error occurred",
          status: "failed",
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error("❌ Error processing inbound media:", error);

    return NextResponse.json(
      {
        error: "Failed to process media",
        message: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
