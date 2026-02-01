/**
 * Send WhatsApp Message API Route (Multi-Tenant)
 * Sends messages using the customer's own WhatsApp Business Account
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  getFacebookAccountByUserId,
  getPrimaryPhoneNumber,
  createMessage,
} from "@/lib/supabase/facebook-whatsapp-queries";
import { createGraphAPIClient } from "@/lib/facebook/graph-api-client";
import { decryptToken } from "@/lib/encryption/crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

// Helper to get or create conversation
async function getOrCreateConversation(
  businessId: string,
  customerPhone: string,
): Promise<string | null> {
  // Try to find existing conversation
  const { data: existingConv, error: findError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_phone", customerPhone)
    .single();

  if (existingConv) {
    return existingConv.id;
  }

  // Create new conversation
  const { data: newConv, error: createError } = await supabaseAdmin
    .from("whatsapp_conversations")
    .insert({
      business_id: businessId,
      customer_phone: customerPhone,
      total_messages: 0,
      unread_count: 0,
      status: "active",
    })
    .select("id")
    .single();

  if (createError) {
    console.error("Error creating conversation:", createError);
    return null;
  }

  return newConv?.id || null;
}

// Helper to update conversation stats after sending
async function updateConversationAfterSend(
  conversationId: string,
  messagePreview: string,
) {
  try {
    // First get current stats
    const { data: current } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("total_messages, human_replies_count")
      .eq("id", conversationId)
      .single();

    if (current) {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          total_messages: (current.total_messages || 0) + 1,
          last_message_at: new Date().toISOString(),
          last_message_direction: "outbound",
          last_message_preview: messagePreview.slice(0, 100),
          human_replies_count: (current.human_replies_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }
  } catch (error) {
    console.error("Error updating conversation stats:", error);
  }
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

    // Parse request body
    const body = await request.json();
    const {
      to,
      message,
      phoneNumberId,
      mediaId,
      mediaType,
      mediaUrl,
      filename,
      // R2 persistent storage metadata
      mediaKey,
      mediaHash,
      mediaSize,
      mediaMime,
      storageProvider,
    } = body;

    console.log("📤 Send message request:", {
      to,
      message,
      phoneNumberId,
      mediaId,
      mediaType,
      bodyKeys: Object.keys(body),
    });

    // Validate required fields - either message (text) or mediaId (media) is required
    const isMediaMessage = !!mediaId && !!mediaType;
    const isTextMessage = !!message;

    if (!to || (!isMediaMessage && !isTextMessage)) {
      console.error("❌ Missing required fields:", {
        to: !!to,
        message: !!message,
        mediaId: !!mediaId,
        mediaType: !!mediaType,
      });
      return NextResponse.json(
        {
          error:
            "Missing required fields: to, and either message or (mediaId + mediaType)",
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

    // Check if phone number is active
    console.log("📱 Phone number status:", {
      phoneNumberId: phoneNumber.phone_number_id,
      displayPhone: phoneNumber.display_phone_number,
      isActive: phoneNumber.is_active,
    });

    if (!phoneNumber.is_active) {
      return NextResponse.json(
        {
          error: "Phone number not active",
          message:
            "This phone number is not active. Please activate it in settings.",
        },
        { status: 400 },
      );
    }

    // Get business_id for this user
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

    // Get or create conversation
    const conversationId = await getOrCreateConversation(businessId, to);
    if (!conversationId) {
      return NextResponse.json(
        { error: "Failed to create conversation" },
        { status: 500 },
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);
    const graphClient = createGraphAPIClient(accessToken);

    let response;
    let messageContent: string;
    let dbMessageType: string;

    if (isMediaMessage) {
      // Send media message
      console.log("📷 Sending media message:", { mediaId, mediaType });
      response = await graphClient.sendMediaMessage(
        phoneNumber.phone_number_id,
        to,
        mediaType as "image" | "video" | "document" | "audio",
        mediaId,
        message, // caption for images/videos
        filename, // filename for documents
      );
      messageContent = message || `[${mediaType}]`;
      dbMessageType = mediaType;
    } else {
      // Send text message
      response = await graphClient.sendWhatsAppMessage(
        phoneNumber.phone_number_id,
        to,
        message,
      );
      messageContent = message;
      dbMessageType = "text";
    }

    // Store message in database using correct schema
    // IMPORTANT: Use R2 URL (persistent) NOT WhatsApp URL (expires)

    // Debug log what we're about to store
    console.log("💾 STORING TO DB:", {
      message_type: dbMessageType,
      media_url: mediaUrl ? mediaUrl.substring(0, 60) + "..." : "UNDEFINED",
      media_id: isMediaMessage ? mediaId : "N/A",
      storage_provider: storageProvider,
      isMediaMessage,
    });

    const messageRecord = await createMessage({
      conversation_id: conversationId,
      business_id: businessId,
      wamid: response.messages[0].id,
      direction: "outbound",
      message_type: dbMessageType,
      content: messageContent,
      status: "sent",
      is_ai_generated: false,
      media_id: isMediaMessage ? mediaId : undefined,
      media_url: mediaUrl || undefined, // R2 URL (source of truth)
      // R2 storage metadata
      media_key: mediaKey || undefined,
      media_hash: mediaHash || undefined,
      media_size: mediaSize || undefined,
      media_mime: mediaMime || undefined,
      storage_provider: storageProvider || undefined,
    });

    // Update conversation stats
    await updateConversationAfterSend(conversationId, messageContent);

    return NextResponse.json({
      success: true,
      data: {
        messageId: response.messages[0].id,
        phoneNumberId: phoneNumber.phone_number_id,
        from: phoneNumber.display_phone_number,
        to,
        messageType: dbMessageType,
      },
    });
  } catch (error: any) {
    console.error("Error sending WhatsApp message:", error);

    // Parse Meta API errors
    let errorMessage = error.message || "Failed to send message";
    if (error.message?.includes("[")) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: "Failed to send message",
        message: errorMessage,
      },
      { status: 500 },
    );
  }
}
