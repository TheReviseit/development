import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Helper to get user ID from Firebase token
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

/**
 * GET /api/showcase/booking-settings
 * Retrieves the booking settings for the authenticated user's showcase
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Try to get existing settings
    const { data, error } = await supabase
      .from("showcase_settings")
      .select(
        "full_day_mode, require_advance, advance_percentage, one_booking_per_day",
      )
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "no rows returned" - not an error for us
      throw error;
    }

    // Return default settings if none exist
    const settings = data || {
      full_day_mode: false,
      require_advance: false,
      advance_percentage: 10,
      one_booking_per_day: false,
    };

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("Error fetching booking settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/showcase/booking-settings
 * Creates or updates booking settings for the authenticated user's showcase
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      full_day_mode,
      require_advance,
      advance_percentage,
      one_booking_per_day,
    } = body;

    // Check if settings exist
    const { data: existing } = await supabase
      .from("showcase_settings")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      // Update existing settings
      const { error } = await supabase
        .from("showcase_settings")
        .update({
          full_day_mode: full_day_mode ?? false,
          require_advance: require_advance ?? false,
          advance_percentage: advance_percentage ?? 10,
          one_booking_per_day: one_booking_per_day ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;
    } else {
      // Insert new settings
      const { error } = await supabase.from("showcase_settings").insert({
        user_id: userId,
        full_day_mode: full_day_mode ?? false,
        require_advance: require_advance ?? false,
        advance_percentage: advance_percentage ?? 10,
        one_booking_per_day: one_booking_per_day ?? false,
      });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving booking settings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save settings" },
      { status: 500 },
    );
  }
}
