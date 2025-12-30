import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user ID from Firebase token
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

// GET - Fetch AI capabilities for current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();

    // Get AI capabilities for user
    const { data, error } = await supabase
      .from("ai_capabilities")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned (user doesn't have settings yet)
      console.error("Error fetching AI capabilities:", error);
      return NextResponse.json(
        { error: "Failed to fetch AI capabilities" },
        { status: 500 }
      );
    }

    // Return default values if no record exists
    const capabilities = data || {
      appointment_booking_enabled: false,
    };

    return NextResponse.json({
      success: true,
      data: capabilities,
    });
  } catch (error) {
    console.error("Error in GET /api/ai-capabilities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST - Update AI capabilities for current user
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { appointment_booking_enabled } = body;

    if (typeof appointment_booking_enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Upsert AI capabilities
    const { data, error } = await supabase
      .from("ai_capabilities")
      .upsert(
        {
          user_id: userId,
          appointment_booking_enabled,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating AI capabilities:", error);
      return NextResponse.json(
        { error: "Failed to update AI capabilities" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in POST /api/ai-capabilities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
