import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/showcase/[username]/booked-dates
 * Returns a list of dates that already have bookings
 * Used when one_booking_per_day is enabled to disable those dates
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await context.params;

    // Get all confirmed/pending bookings for this user
    // We exclude cancelled bookings
    const { data, error } = await supabase
      .from("appointments")
      .select("date")
      .eq("user_id", username)
      .in("booking_status", ["pending", "confirmed", "payment_pending"])
      .gte("date", new Date().toISOString().split("T")[0]); // Only future dates

    if (error) {
      throw error;
    }

    // Extract unique dates
    const bookedDates = [...new Set(data?.map((b) => b.date) || [])];

    return NextResponse.json({
      success: true,
      dates: bookedDates,
    });
  } catch (error) {
    console.error("Error fetching booked dates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch booked dates" },
      { status: 500 },
    );
  }
}
