/**
 * WhatsApp Messages API Route
 * Fetches messages for a specific conversation
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

    // Get contact phone from query params
    const { searchParams } = new URL(request.url);
    const contactPhone = searchParams.get("contactPhone");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!contactPhone) {
      return NextResponse.json(
        { error: "contactPhone is required" },
        { status: 400 }
      );
    }

    // Fetch messages for this conversation
    // Messages where from_number or to_number matches the contact
    const { data: messages, error } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("*")
      .eq("user_id", user.id)
      .or(`from_number.eq.${contactPhone},to_number.eq.${contactPhone}`)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching messages:", error);
      // Check if it's a table not found error
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
        { status: 500 }
      );
    }

    // Mark inbound messages as read
    const unreadMessageIds = (messages || [])
      .filter((m) => m.direction === "inbound" && m.status !== "read")
      .map((m) => m.id);

    if (unreadMessageIds.length > 0) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "read", read_at: new Date().toISOString() })
        .in("id", unreadMessageIds);
    }

    // Format messages for frontend
    const formattedMessages = (messages || []).map((msg) => ({
      id: msg.id,
      messageId: msg.message_id,
      sender: msg.direction === "inbound" ? "contact" : "user",
      content: msg.message_body || "",
      time: formatTime(msg.created_at),
      timestamp: msg.created_at,
      type: msg.message_type,
      status: msg.status,
      mediaUrl: msg.media_url,
      mediaId: msg.media_id,
    }));

    // Get contact details from the first inbound message
    const firstInbound = (messages || []).find(
      (m) => m.direction === "inbound"
    );
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
    });
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", message: error.message },
      { status: 500 }
    );
  }
}

// Helper to format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
}

// Helper to format phone numbers nicely
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
