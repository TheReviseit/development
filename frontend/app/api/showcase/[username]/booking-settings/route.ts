import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/showcase/[username]/booking-settings
 * Public endpoint to fetch booking settings for a specific showcase
 * Used by the customer booking page
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await context.params;

    // Fetch settings for this user
    const { data, error } = await supabase
      .from("showcase_settings")
      .select(
        "full_day_mode, require_advance, advance_percentage, one_booking_per_day",
      )
      .eq("user_id", username)
      .single();

    if (error && error.code !== "PGRST116") {
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
