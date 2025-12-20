/**
 * WhatsApp Conversations API Route - v2.0
 * Uses the new whatsapp_conversations table for fast inbox loading
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

    // Get query params
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all";
    const status = searchParams.get("status") || "active";
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // First, get the business_id for this user from connected_business_managers
    const { data: businessManager, error: bmError } = await supabaseAdmin
      .from("connected_business_managers")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (bmError || !businessManager) {
      // No business manager found - return empty conversations
      console.log("No business manager found for user:", user.id);
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        message: "No business account connected. Please complete onboarding.",
      });
    }

    const businessId = businessManager.id;

    // Build query for conversations table using business_id
    let query = supabaseAdmin
      .from("whatsapp_conversations")
      .select("*")
      .eq("business_id", businessId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filter === "unread") {
      query = query.gt("unread_count", 0);
    }

    if (status !== "all") {
      query = query.eq("status", status);
    }

    // Apply search
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,last_message_preview.ilike.%${search}%`
      );
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error("Error fetching conversations:", error);

      // Fallback to old method if new table doesn't exist
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return await fallbackToOldMethod(businessId, filter);
      }

      return NextResponse.json(
        { error: "Failed to fetch conversations", details: error.message },
        { status: 500 }
      );
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
      });
    }

    // Format for frontend
    const formattedConversations = conversations.map((conv) => ({
      id: conv.id,
      name: conv.customer_name || formatPhoneNumber(conv.customer_phone),
      phone: conv.customer_phone,
      profilePic: conv.customer_profile_pic,
      lastMessage: conv.last_message_preview || "",
      lastMessageType: conv.last_message_type,
      time: formatRelativeTime(conv.last_message_at),
      timestamp: conv.last_message_at,
      unread: conv.unread_count || 0,
      totalMessages: conv.total_messages || 0,
      status: conv.status,
      priority: conv.priority,
      tags: conv.tags || [],
      // AI stats
      aiReplies: conv.ai_replies_count || 0,
      humanReplies: conv.human_replies_count || 0,
      language: conv.detected_language,
      // Online status (not available from WhatsApp API)
      online: false,
    }));

    return NextResponse.json({
      success: true,
      data: formattedConversations,
      total: formattedConversations.length,
      hasMore: conversations.length === limit,
    });
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations", message: error.message },
      { status: 500 }
    );
  }
}

// Fallback to old method (fetching from whatsapp_messages directly)
async function fallbackToOldMethod(businessId: string, filter: string) {
  const { data: messages, error } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error || !messages || messages.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      message: error ? "Error loading messages" : "No messages yet",
    });
  }

  // Group by contact phone
  const conversationsMap = new Map<string, any>();

  for (const msg of messages) {
    const contactPhone =
      msg.direction === "inbound" ? msg.from_number : msg.to_number;

    if (!conversationsMap.has(contactPhone)) {
      conversationsMap.set(contactPhone, {
        id: contactPhone,
        name: msg.metadata?.contact_name || formatPhoneNumber(contactPhone),
        phone: contactPhone,
        lastMessage: msg.message_body || `[${msg.message_type}]`,
        time: formatRelativeTime(msg.created_at),
        timestamp: msg.created_at,
        unread: msg.direction === "inbound" && msg.status !== "read" ? 1 : 0,
        online: false,
      });
    } else {
      const existing = conversationsMap.get(contactPhone)!;
      if (msg.direction === "inbound" && msg.status !== "read") {
        existing.unread++;
      }
    }
  }

  let conversations = Array.from(conversationsMap.values());

  if (filter === "unread") {
    conversations = conversations.filter((c) => c.unread > 0);
  }

  return NextResponse.json({
    success: true,
    data: conversations,
    total: conversations.length,
    fallback: true,
  });
}

// Helper to format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
