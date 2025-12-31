import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Internal API key for backend-to-frontend communication
const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY || "reviseit-internal-key";

// Validate internal API request
function validateInternalRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  return apiKey === INTERNAL_API_KEY;
}

/**
 * POST /api/ai-appointment-book
 *
 * API endpoint for AI bot to book appointments.
 * Called from the Python backend when the AI has collected all required information.
 *
 * Request body:
 * {
 *   user_id: string,           // Business owner's Firebase UID
 *   customer_name: string,
 *   customer_phone: string,
 *   customer_email?: string,
 *   date: string,              // YYYY-MM-DD
 *   time: string,              // HH:MM
 *   service?: string,
 *   notes?: string,
 *   custom_fields?: object,    // Any additional fields collected by AI
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate internal API request
    if (!validateInternalRequest(request)) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid API key" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      user_id,
      customer_name,
      customer_phone,
      customer_email,
      date,
      time,
      service,
      notes,
      custom_fields,
      duration = 60,
    } = body;

    // Validate required fields
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: "user_id is required" },
        { status: 400 }
      );
    }
    if (!customer_name || !customer_phone || !date || !time) {
      return NextResponse.json(
        {
          success: false,
          error: "customer_name, customer_phone, date, and time are required",
        },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { success: false, error: "date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    // Validate time format
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(time)) {
      return NextResponse.json(
        { success: false, error: "time must be in HH:MM format" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Check if the time slot is available (conflict check)
    const { data: existingAppointments, error: checkError } = await supabase
      .from("appointments")
      .select("id, time, duration")
      .eq("user_id", user_id)
      .eq("date", date)
      .neq("status", "cancelled");

    if (checkError) {
      console.error("Error checking appointments:", checkError);
      return NextResponse.json(
        { success: false, error: "Failed to check availability" },
        { status: 500 }
      );
    }

    // Check for time conflicts
    const requestedStart = parseTime(time);
    const requestedEnd = requestedStart + duration;

    for (const apt of existingAppointments || []) {
      const existingStart = parseTime(apt.time);
      const existingEnd = existingStart + (apt.duration || 60);

      if (requestedStart < existingEnd && requestedEnd > existingStart) {
        // Conflict detected - get available slots
        const availableSlots = await getAvailableSlots(
          supabase,
          user_id,
          date,
          duration
        );

        return NextResponse.json(
          {
            success: false,
            conflict: true,
            error: "Time slot not available",
            available_slots: availableSlots,
            message: `The requested time ${time} is already booked. Available slots: ${availableSlots.join(
              ", "
            )}`,
          },
          { status: 409 }
        );
      }
    }

    // Create the appointment
    const appointmentData = {
      user_id,
      customer_name,
      customer_phone,
      customer_email: customer_email || null,
      date,
      time,
      duration,
      status: "pending",
      source: "ai",
      service: service || null,
      notes: notes || null,
      custom_fields: custom_fields || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("appointments")
      .insert(appointmentData)
      .select()
      .single();

    if (error) {
      console.error("Error creating appointment:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create appointment" },
        { status: 500 }
      );
    }

    // Return success with appointment details
    return NextResponse.json({
      success: true,
      appointment: data,
      message: generateConfirmationMessage(customer_name, date, time),
    });
  } catch (error) {
    console.error("Error in POST /api/ai-appointment-book:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai-appointment-book
 *
 * Get appointment configuration and available slots for a business.
 * Used by AI to know what questions to ask and check availability.
 *
 * Query params:
 * - user_id: Business owner's Firebase UID (required)
 * - date: Optional date to check availability (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate internal API request
    if (!validateInternalRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const date = searchParams.get("date");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "user_id is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Get appointment configuration
    const { data: config, error: configError } = await supabase
      .from("ai_capabilities")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (configError && configError.code !== "PGRST116") {
      console.error("Error fetching config:", configError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch configuration" },
        { status: 500 }
      );
    }

    const appointmentConfig = {
      enabled: config?.appointment_booking_enabled || false,
      fields: config?.appointment_fields || [
        {
          id: "name",
          label: "Full Name",
          type: "text",
          required: true,
          order: 1,
        },
        {
          id: "phone",
          label: "Phone Number",
          type: "phone",
          required: true,
          order: 2,
        },
        {
          id: "date",
          label: "Appointment Date",
          type: "date",
          required: true,
          order: 3,
        },
        {
          id: "time",
          label: "Appointment Time",
          type: "time",
          required: true,
          order: 4,
        },
      ],
      business_hours: config?.appointment_business_hours || {
        start: "09:00",
        end: "18:00",
        duration: 60,
      },
      minimal_mode: config?.appointment_minimal_mode || false,
    };

    // If date provided, also get available slots
    let availableSlots: string[] = [];
    if (date && appointmentConfig.enabled) {
      availableSlots = await getAvailableSlots(
        supabase,
        userId,
        date,
        appointmentConfig.business_hours.duration
      );
    }

    return NextResponse.json({
      success: true,
      config: appointmentConfig,
      available_slots: availableSlots,
    });
  } catch (error) {
    console.error("Error in GET /api/ai-appointment-book:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to parse time string to minutes since midnight
function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper function to format minutes to time string
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

// Get available time slots for a date
async function getAvailableSlots(
  supabase: any,
  userId: string,
  date: string,
  duration: number
): Promise<string[]> {
  try {
    // Get booked appointments for the date
    const { data: appointments } = await supabase
      .from("appointments")
      .select("time, duration")
      .eq("user_id", userId)
      .eq("date", date)
      .neq("status", "cancelled");

    // Get business hours (default to 9 AM - 6 PM)
    const { data: config } = await supabase
      .from("ai_capabilities")
      .select("appointment_business_hours")
      .eq("user_id", userId)
      .single();

    const businessHours = config?.appointment_business_hours || {
      start: "09:00",
      end: "18:00",
      duration: 60,
    };

    const startMinutes = parseTime(businessHours.start);
    const endMinutes = parseTime(businessHours.end);
    const slotDuration = businessHours.duration || duration;

    // Generate all possible slots
    const bookedTimes = new Set(
      appointments?.map((a: { time: string; duration?: number }) => a.time) ||
        []
    );
    const availableSlots: string[] = [];

    for (
      let time = startMinutes;
      time + slotDuration <= endMinutes;
      time += slotDuration
    ) {
      const timeStr = formatTime(time);
      if (!bookedTimes.has(timeStr)) {
        availableSlots.push(timeStr);
      }
    }

    return availableSlots;
  } catch (error) {
    console.error("Error getting available slots:", error);
    return [];
  }
}

// Generate confirmation message
function generateConfirmationMessage(
  name: string,
  date: string,
  time: string
): string {
  // Format time for display
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const formattedTime = `${displayHours}:${minutes
    .toString()
    .padStart(2, "0")} ${period}`;

  return `✅ Appointment confirmed!

Hi ${name.split(" ")[0]}, your appointment is scheduled for:
📅 Date: ${date}
🕐 Time: ${formattedTime}

We'll see you soon! 🎉`;
}
