/**
 * WhatsApp Messages API Route - v2.0
 * Fetches messages for a specific conversation using conversation_id
 */

import { NextRequest, NextResponse } from "next/server";

// Force dynamic rendering to prevent caching of API responses
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    // Verify user session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decodedClaims;
    try {
      decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    } catch (authError: any) {
      console.error("Session verification failed:", authError.message);
      return NextResponse.json(
        { error: "Session expired", message: "Please log in again" },
        { status: 401 },
      );
    }

    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const contactPhone = searchParams.get("contactPhone");
    const before = searchParams.get("before"); // Cursor for loading older messages
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const markAsRead = searchParams.get("markAsRead") !== "false";

    if (!conversationId && !contactPhone) {
      return NextResponse.json(
        { error: "conversationId or contactPhone is required" },
        { status: 400 },
      );
    }

    // First, get the business_id for this user from connected_business_managers
    const { data: businessManager, error: bmError } = await supabaseAdmin
      .from("connected_business_managers")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (bmError || !businessManager) {
      // No business manager found - return empty messages with fallback
      console.log("No business manager found for user:", user.id);
      return NextResponse.json({
        success: true,
        data: {
          messages: [],
          contact: {
            phone: contactPhone || "",
            name: formatPhoneNumber(contactPhone || ""),
          },
          hasMore: false,
        },
        message: "No business account connected. Please complete onboarding.",
      });
    }

    const businessId = businessManager.id;

    let actualConversationId = conversationId;
    let conversation = null;

    // If using contactPhone, get or create conversation
    if (!conversationId && contactPhone) {
      // Try to find conversation by phone using business_id
      const { data: convData, error: convError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("*")
        .eq("business_id", businessId)
        .eq("customer_phone", contactPhone)
        .single();

      if (convError && convError.code !== "PGRST116") {
        // PGRST116 = no rows found
        // If table doesn't exist, fall back to old method
        if (
          convError.code === "42P01" ||
          convError.message?.includes("does not exist")
        ) {
          return await fallbackToOldMethod(
            businessId,
            contactPhone,
            limit,
            offset,
            markAsRead,
          );
        }
      }

      if (convData) {
        actualConversationId = convData.id;
        conversation = convData;
      } else {
        // Fallback: fetch from messages table
        return await fallbackToOldMethod(
          businessId,
          contactPhone,
          limit,
          offset,
          markAsRead,
        );
      }
    } else if (conversationId) {
      // Get conversation details using business_id for security
      const { data: convData } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("*")
        .eq("id", conversationId)
        .eq("business_id", businessId)
        .single();

      conversation = convData;
    }

    console.log(
      `🔍 Fetching messages for conversation: ${actualConversationId}${before ? ` (before: ${before})` : ""}`,
    );

    // CURSOR-BASED PAGINATION with COMPOSITE CURSOR
    // WhatsApp-style: Load 50 messages initially, paginate on scroll up
    // This improves performance and scroll stability
    const MAX_MESSAGES = 50;

    let messagesQuery = supabaseAdmin
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", actualConversationId);

    if (before) {
      // Parse composite cursor: "timestamp:id"
      const [cursorTimestamp, cursorId] = before.split("::");

      if (cursorTimestamp && cursorId) {
        // Loading older messages with composite cursor
        // Logic: (created_at < cursor_time) OR (created_at = cursor_time AND id < cursor_id)
        messagesQuery = messagesQuery
          .or(
            `created_at.lt.${cursorTimestamp},and(created_at.eq.${cursorTimestamp},id.lt.${cursorId})`,
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(MAX_MESSAGES);
      } else {
        // Fallback for legacy cursor format (timestamp only)
        messagesQuery = messagesQuery
          .lt("created_at", before)
          .order("created_at", { ascending: false })
          .limit(MAX_MESSAGES);
      }
    } else {
      // Initial load: fetch latest 1000 messages
      messagesQuery = messagesQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MAX_MESSAGES);
    }

    let { data: messages, error } = await messagesQuery;

    // Reverse to get chronological order (oldest first) for display
    if (messages) {
      messages = messages.reverse();
    }

    console.log(
      `📬 Fetched ${
        messages?.length || 0
      } messages for conversation ${actualConversationId}${before ? " (older)" : ""}`,
    );

    if (error) {
      console.error("Error fetching messages:", error);
      return NextResponse.json(
        { error: "Failed to fetch messages", details: error.message },
        { status: 500 },
      );
    }

    // Mark as read if requested
    if (markAsRead && actualConversationId) {
      try {
        // Try using the database function first
        await supabaseAdmin.rpc("mark_conversation_read", {
          p_conversation_id: actualConversationId,
        });
      } catch {
        // Fallback if function doesn't exist
        await supabaseAdmin
          .from("whatsapp_messages")
          .update({
            status: "read",
            status_updated_at: new Date().toISOString(),
          })
          .eq("conversation_id", actualConversationId)
          .eq("direction", "inbound")
          .neq("status", "read");

        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({ unread_count: 0 })
          .eq("id", actualConversationId);
      }
    }

    // Format messages for frontend
    const formattedMessages = (messages || []).map((msg) => ({
      id: msg.id,
      messageId: msg.wamid, // Schema uses 'wamid' not 'message_id'
      sender: msg.direction === "inbound" ? "contact" : "user",
      content: msg.content || "", // Schema uses 'content' not 'message_body'
      time: formatTime(msg.created_at),
      timestamp: msg.created_at,
      type: msg.message_type,
      status: msg.status,
      mediaUrl: msg.media_url,
      mediaId: msg.media_id,
      // AI info
      isAiGenerated: msg.is_ai_generated || false,
      intent: msg.intent_detected,
    }));

    // Build contact info from conversation
    const contactInfo = conversation
      ? {
          phone: conversation.customer_phone,
          name:
            conversation.customer_name ||
            formatPhoneNumber(conversation.customer_phone),
          profilePic: conversation.customer_profile_pic,
          totalMessages: conversation.total_messages,
          aiReplies: conversation.ai_replies_count,
          humanReplies: conversation.human_replies_count,
          language: conversation.detected_language,
          tags: conversation.tags || [],
          status: conversation.status,
          firstMessageAt: conversation.first_message_at,
        }
      : {
          phone: contactPhone,
          name: formatPhoneNumber(contactPhone || ""),
        };

    // Calculate pagination metadata with COMPOSITE CURSOR (timestamp::id)
    const rawMessageCount = (messages || []).length;
    const hasMoreMessages = rawMessageCount === MAX_MESSAGES;
    // Composite cursor format: "timestamp::id" for deterministic pagination
    const oldestMessage =
      formattedMessages.length > 0 ? formattedMessages[0] : null;
    const oldestCursor = oldestMessage
      ? `${oldestMessage.timestamp}::${oldestMessage.id}`
      : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          conversationId: actualConversationId,
          messages: formattedMessages,
          contact: contactInfo,
          hasMore: hasMoreMessages,
          oldestCursor: oldestCursor,
          totalInConversation:
            conversation?.total_messages || formattedMessages.length,
        },
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", message: error.message },
      { status: 500 },
    );
  }
}

// Fallback to old method (fetching without conversations table)
async function fallbackToOldMethod(
  businessId: string,
  contactPhone: string,
  limit: number,
  offset: number,
  markAsRead: boolean,
) {
  const { data: messages, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("*")
    .eq("business_id", businessId)
    .or(`from_number.eq.${contactPhone},to_number.eq.${contactPhone}`)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching messages:", error);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return NextResponse.json({
        success: true,
        data: {
          messages: [],
          contact: {
            phone: contactPhone,
            name: formatPhoneNumber(contactPhone),
          },
          hasMore: false,
        },
      });
    }
    return NextResponse.json(
      { error: "Failed to fetch messages", details: error.message },
      { status: 500 },
    );
  }

  // Mark as read
  if (markAsRead) {
    const unreadIds = (messages || [])
      .filter((m) => m.direction === "inbound" && m.status !== "read")
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "read", status_updated_at: new Date().toISOString() })
        .in("id", unreadIds);
    }
  }

  // Format messages
  const formattedMessages = (messages || []).map((msg) => ({
    id: msg.id,
    messageId: msg.wamid, // Schema uses 'wamid'
    sender: msg.direction === "inbound" ? "contact" : "user",
    content: msg.content || "", // Schema uses 'content'
    time: formatTime(msg.created_at),
    timestamp: msg.created_at,
    type: msg.message_type,
    status: msg.status,
    mediaUrl: msg.media_url,
    mediaId: msg.media_id,
  }));

  const firstInbound = (messages || []).find((m) => m.direction === "inbound");
  const contactInfo = {
    phone: contactPhone,
    name:
      firstInbound?.metadata?.contact_name || formatPhoneNumber(contactPhone),
  };

  return NextResponse.json({
    success: true,
    data: {
      messages: formattedMessages,
      contact: contactInfo,
      hasMore: (messages || []).length === limit,
    },
    fallback: true,
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
    .toLowerCase();
}

// Helper to format phone numbers
function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length >= 10) {
    const countryCode = digits.slice(0, digits.length - 10);
    const areaCode = digits.slice(-10, -7);
    const prefix = digits.slice(-7, -4);
    const line = digits.slice(-4);

    if (countryCode) {
      return `+${countryCode} ${areaCode} ${prefix} ${line}`;
    }
    return `(${areaCode}) ${prefix}-${line}`;
  }

  return phone;
}
