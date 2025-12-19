/**
 * WhatsApp Conversations API Route
 * Fetches conversations grouped by contact phone number
 */

import { NextRequest, NextResponse } from "next/server";
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
        { status: 401 }
      );
    }

    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get filter from query params
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";

    // Fetch conversations grouped by contact phone number
    // Get all messages for this user
    const { data: messages, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching messages:", error);
      // Check if it's a table not found error
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        // Table doesn't exist, return empty array
        return NextResponse.json({
          success: true,
          data: [],
          total: 0,
          message: "No messages yet",
        });
      }
      return NextResponse.json(
        { error: "Failed to fetch conversations", details: error.message },
        { status: 500 }
      );
    }

    // If no messages, return empty array (not an error)
    if (!messages || messages.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
      });
    }

    // Group messages by contact phone number
    const conversationsMap = new Map<
      string,
      {
        id: string;
        contactPhone: string;
        contactName: string | null;
        lastMessage: string;
        lastMessageTime: string;
        unreadCount: number;
        direction: string;
        messageType: string;
      }
    >();

    for (const msg of messages) {
      // Determine the contact phone (the other party, not us)
      const contactPhone =
        msg.direction === "inbound" ? msg.from_number : msg.to_number;

      if (!conversationsMap.has(contactPhone)) {
        // Extract contact name from metadata if available
        const contactName = msg.metadata?.contact_name || null;

        conversationsMap.set(contactPhone, {
          id: contactPhone,
          contactPhone,
          contactName,
          lastMessage: msg.message_body || `[${msg.message_type}]`,
          lastMessageTime: msg.created_at,
          unreadCount:
            msg.direction === "inbound" && msg.status !== "read" ? 1 : 0,
          direction: msg.direction,
          messageType: msg.message_type,
        });
      } else {
        // Update unread count
        const existing = conversationsMap.get(contactPhone)!;
        if (msg.direction === "inbound" && msg.status !== "read") {
          existing.unreadCount++;
        }
        // Update contact name if we found one
        if (!existing.contactName && msg.metadata?.contact_name) {
          existing.contactName = msg.metadata.contact_name;
        }
      }
    }

    // Convert to array and sort by last message time
    let conversations = Array.from(conversationsMap.values());

    // Apply filter
    if (filter === "unread") {
      conversations = conversations.filter((c) => c.unreadCount > 0);
    }

    // Format time for display
    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `${diffMinutes}m`;
      } else if (diffHours < 24) {
        return `${diffHours}h`;
      } else if (diffDays < 7) {
        return `${diffDays}d`;
      } else {
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }
    };

    // Format conversations for frontend
    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      name: conv.contactName || formatPhoneNumber(conv.contactPhone),
      phone: conv.contactPhone,
      lastMessage: conv.lastMessage,
      time: formatTime(conv.lastMessageTime),
      timestamp: conv.lastMessageTime,
      unread: conv.unreadCount,
      online: false, // We can't determine online status from WhatsApp Cloud API
    }));

    return NextResponse.json({
      success: true,
      data: formattedConversations,
      total: formattedConversations.length,
    });
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations", message: error.message },
      { status: 500 }
    );
  }
}

// Helper to format phone numbers nicely
function formatPhoneNumber(phone: string): string {
  // Remove any non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If it's a long number, format with country code
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
