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

// POST - Check availability for a given date
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, duration = 60 } = body;

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get existing appointments for the date
    const { data: existingAppointments, error } = await supabase
      .from("appointments")
      .select("time, duration")
      .eq("user_id", userId)
      .eq("date", date)
      .neq("status", "cancelled")
      .order("time", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to check availability" },
        { status: 500 }
      );
    }

    // Default business hours (9 AM to 6 PM)
    // In production, this should come from business settings
    const businessHours = {
      start: "09:00",
      end: "18:00",
    };

    // Generate all possible slots
    const slots: { time: string; available: boolean }[] = [];
    const startHour = parseInt(businessHours.start.split(":")[0]);
    const endHour = parseInt(businessHours.end.split(":")[0]);
    const slotDuration = duration; // in minutes

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;

        // Check if slot is booked
        const isBooked = existingAppointments?.some((apt) => {
          const aptTime = apt.time;
          const aptDuration = apt.duration || 60;

          // Simple overlap check
          const slotStart = hour * 60 + minute;
          const slotEnd = slotStart + slotDuration;
          const aptStart =
            parseInt(aptTime.split(":")[0]) * 60 +
            parseInt(aptTime.split(":")[1]);
          const aptEnd = aptStart + aptDuration;

          return slotStart < aptEnd && slotEnd > aptStart;
        });

        slots.push({
          time: timeStr,
          available: !isBooked,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        date,
        business_hours: businessHours,
        slots,
        booked_appointments: existingAppointments?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/appointments/availability:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
