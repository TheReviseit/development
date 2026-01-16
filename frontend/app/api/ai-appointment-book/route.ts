import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Internal API key for backend-to-frontend communication
// For local development, we accept the default key without needing env vars
const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY || "flowauxi-internal-key";
const DEFAULT_API_KEY = "flowauxi-internal-key";

// Validate internal API request
function validateInternalRequest(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const host = request.headers.get("host") || "";

  // For local development (localhost), be more permissive
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

  // Accept either the env var key OR the default key
  if (apiKey === INTERNAL_API_KEY || apiKey === DEFAULT_API_KEY) {
    return true;
  }

  // For localhost, also allow requests without API key (dev mode)
  if (isLocalhost && !process.env.INTERNAL_API_KEY) {
    console.log(
      "⚠️ AI Appointment API: Allowing request without API key (localhost dev mode)"
    );
    return true;
  }

  console.log("❌ AI Appointment API: Invalid API key");
  console.log("   Received:", apiKey);
  console.log("   Expected:", INTERNAL_API_KEY);
  return false;
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

    // Parse and normalize date format (accepts multiple formats)
    // Expected input from backend is YYYY-MM-DD (already normalized)
    // But we also handle DD-MM-YY format just in case
    let normalizedDate = date;

    // Check if already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      normalizedDate = date;
    }
    // Try DD-MM-YY format (preferred user format)
    else if (/^(\d{2})-(\d{2})-(\d{2})$/.test(date)) {
      const match = date.match(/^(\d{2})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, d, m, y] = match; // DD-MM-YY
        const year = parseInt(y) < 50 ? `20${y}` : `19${y}`;
        normalizedDate = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
    // Try DD/MM/YY format
    else if (/^(\d{2})\/(\d{2})\/(\d{2})$/.test(date)) {
      const match = date.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
      if (match) {
        const [, d, m, y] = match; // DD/MM/YY
        const year = parseInt(y) < 50 ? `20${y}` : `19${y}`;
        normalizedDate = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
    // Try DD-MM-YYYY format
    else if (/^(\d{2})-(\d{2})-(\d{4})$/.test(date)) {
      const match = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (match) {
        const [, d, m, y] = match; // DD-MM-YYYY
        normalizedDate = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    // Final validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid date format: ${date}. Expected YYYY-MM-DD or DD-MM-YY`,
        },
        { status: 400 }
      );
    }

    console.log(`📅 Date parsed: ${date} → ${normalizedDate}`);

    // Parse and normalize time format (accepts multiple formats)
    let normalizedTime = time;

    // Handle "10:00 AM" or "2:30 PM" format
    const time12Match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (time12Match) {
      let [, hours, minutes, period] = time12Match;
      let hour = parseInt(hours);
      if (period.toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
      } else if (period.toUpperCase() === "AM" && hour === 12) {
        hour = 0;
      }
      normalizedTime = `${hour.toString().padStart(2, "0")}:${minutes}`;
    }

    // Handle "10AM" or "2PM" format (no minutes)
    const timeSimpleMatch = time.match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (timeSimpleMatch) {
      let [, hours, period] = timeSimpleMatch;
      let hour = parseInt(hours);
      if (period.toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
      } else if (period.toUpperCase() === "AM" && hour === 12) {
        hour = 0;
      }
      normalizedTime = `${hour.toString().padStart(2, "0")}:00`;
    }

    // Final validation
    if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid time format: ${time}. Expected HH:MM or HH:MM AM/PM`,
        },
        { status: 400 }
      );
    }

    // Use normalized values
    const finalDate = normalizedDate;
    const finalTime = normalizedTime;

    console.log(`📅 Normalized date: ${date} → ${finalDate}`);
    console.log(`⏰ Normalized time: ${time} → ${finalTime}`);

    const supabase = getSupabase();

    // The user_id from backend could be either:
    // 1. Supabase UUID (from connected_business_managers.id)
    // 2. Firebase UID directly (from business_data.business_id - set in firebase_client.py)
    // We need to get the Firebase UID for storing appointments
    let firebaseUid = user_id;
    let idResolutionMethod = "unknown";

    console.log(`🔍 AI Appointment: Resolving user_id: ${user_id}`);

    // First, check if the user_id looks like a Firebase UID (they typically start with alphanumeric chars)
    // Supabase UUIDs have the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const isUUIDFormat =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        user_id
      );

    if (isUUIDFormat) {
      // Looks like a Supabase UUID - try to get Firebase UID
      console.log(
        `🔗 AI Appointment: user_id appears to be Supabase UUID format`
      );
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("firebase_uid")
        .eq("id", user_id)
        .single();

      if (userData?.firebase_uid) {
        firebaseUid = userData.firebase_uid;
        idResolutionMethod = "supabase_uuid_mapped";
        console.log(`✅ Mapped Supabase UUID → Firebase UID: ${firebaseUid}`);
      } else {
        console.warn(
          `⚠️ Could not find Firebase UID for Supabase UUID: ${user_id}, error: ${userError?.message}`
        );
        idResolutionMethod = "supabase_uuid_not_found";
      }
    } else {
      // Looks like a Firebase UID - verify it exists in the users table
      console.log(
        `🔗 AI Appointment: user_id appears to be Firebase UID format`
      );
      const { data: fbUser, error: fbError } = await supabase
        .from("users")
        .select("id, firebase_uid")
        .eq("firebase_uid", user_id)
        .single();

      if (fbUser) {
        firebaseUid = user_id; // Confirmed it's a Firebase UID
        idResolutionMethod = "firebase_uid_verified";
        console.log(
          `✅ Verified Firebase UID exists: ${firebaseUid} (Supabase user id: ${fbUser.id})`
        );
      } else {
        // Firebase UID not found in users table - this is the likely problem!
        console.warn(
          `⚠️ Firebase UID not found in users table: ${user_id}, error: ${fbError?.message}`
        );
        console.warn(
          `⚠️ This may cause appointments to not appear in dashboard!`
        );
        idResolutionMethod = "firebase_uid_not_in_db";
        // Still use it as-is since it came from the backend's Firebase lookup
        firebaseUid = user_id;
      }
    }

    console.log(
      `📋 AI Appointment: Final user_id resolution: ${firebaseUid} (method: ${idResolutionMethod})`
    );

    // Get service configuration to check capacity
    const { data: aiConfig } = await supabase
      .from("ai_capabilities")
      .select("appointment_services")
      .eq("user_id", firebaseUid)
      .single();

    // Get capacity for the requested service (default to 1)
    const services = aiConfig?.appointment_services || [
      { id: "default", name: "General Appointment", duration: 60, capacity: 1 },
    ];

    // Find the matching service or use default capacity
    const matchingService =
      services.find(
        (s: { name: string }) =>
          s.name.toLowerCase() === (service || "").toLowerCase()
      ) || services[0];

    const serviceCapacity = matchingService?.capacity || 1;
    console.log(
      `📋 Service capacity for "${service || "General"}": ${serviceCapacity}`
    );

    // Check if the time slot is available (conflict check with capacity)
    const { data: existingAppointments, error: checkError } = await supabase
      .from("appointments")
      .select("id, time, duration, service")
      .eq("user_id", firebaseUid)
      .eq("date", finalDate)
      .eq("time", finalTime)
      .neq("status", "cancelled");

    if (checkError) {
      console.error("Error checking appointments:", checkError);
      return NextResponse.json(
        { success: false, error: "Failed to check availability" },
        { status: 500 }
      );
    }

    // Check if capacity is exceeded
    const currentBookingsAtTime = existingAppointments?.length || 0;
    console.log(
      `📋 Current bookings at ${finalTime}: ${currentBookingsAtTime}/${serviceCapacity}`
    );

    if (currentBookingsAtTime >= serviceCapacity) {
      // Capacity exceeded - get available slots
      const availableSlots = await getAvailableSlots(
        supabase,
        firebaseUid,
        finalDate,
        duration,
        serviceCapacity
      );

      return NextResponse.json(
        {
          success: false,
          conflict: true,
          error: "Time slot not available",
          available_slots: availableSlots,
          message: `Sorry, that time slot is already booked. Available times: ${availableSlots.join(
            ", "
          )}. Please choose another time.`,
        },
        { status: 409 }
      );
    }

    // Create the appointment (use Firebase UID for consistency with dashboard)
    const appointmentData = {
      user_id: firebaseUid,
      customer_name,
      customer_phone,
      customer_email: customer_email || null,
      date: finalDate,
      time: finalTime,
      duration,
      status: "confirmed", // AI bookings are instantly confirmed
      source: "ai",
      service: service || null,
      notes: notes || null,
      custom_fields: custom_fields || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("📝 Creating appointment:", appointmentData);

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

    console.log("✅ Appointment created successfully:", data);

    // Return success with appointment details
    return NextResponse.json({
      success: true,
      appointment: data,
      message: generateConfirmationMessage(customer_name, finalDate, finalTime),
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

    // The user_id from backend could be a Supabase UUID - convert to Firebase UID
    let firebaseUid = userId;

    console.log(`🔍 AI Appointment GET: Resolving user_id: ${userId}`);

    // First, check if the user_id looks like a UUID format
    const isUUIDFormat =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId
      );

    if (isUUIDFormat) {
      // Looks like a Supabase UUID - try to get Firebase UID
      const { data: userData } = await supabase
        .from("users")
        .select("firebase_uid")
        .eq("id", userId)
        .single();

      if (userData?.firebase_uid) {
        firebaseUid = userData.firebase_uid;
        console.log(
          `🔗 GET: Mapped Supabase UUID → Firebase UID: ${firebaseUid}`
        );
      } else {
        console.log(`⚠️ GET: Supabase UUID not found, using as-is: ${userId}`);
      }
    } else {
      // Looks like a Firebase UID - verify it exists
      const { data: fbUser } = await supabase
        .from("users")
        .select("id")
        .eq("firebase_uid", userId)
        .single();

      if (fbUser) {
        console.log(`✅ GET: Verified Firebase UID: ${userId}`);
      } else {
        console.log(
          `⚠️ GET: Firebase UID not in users table, using as-is: ${userId}`
        );
      }
    }

    // Get appointment configuration (use Firebase UID)
    const { data: config, error: configError } = await supabase
      .from("ai_capabilities")
      .select("*")
      .eq("user_id", firebaseUid)
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
          id: "service",
          label: "Service",
          type: "text",
          required: true,
          order: 1,
        },
        {
          id: "date",
          label: "Appointment Date",
          type: "date",
          required: true,
          order: 2,
        },
        {
          id: "time",
          label: "Appointment Time",
          type: "time",
          required: true,
          order: 3,
        },
        {
          id: "name",
          label: "Full Name",
          type: "text",
          required: true,
          order: 4,
        },
        {
          id: "phone",
          label: "Phone Number",
          type: "phone",
          required: true,
          order: 5,
        },
      ],
      business_hours: config?.appointment_business_hours || {
        start: "09:00",
        end: "18:00",
        duration: 60,
      },
      services: config?.appointment_services || [
        {
          id: "default",
          name: "General Appointment",
          duration: 60,
          capacity: 1,
        },
      ],
      minimal_mode: config?.appointment_minimal_mode || false,
    };

    // If date provided, get available slots (always provide slots based on business hours)
    let availableSlots: string[] = [];
    if (date) {
      // Get default capacity from services
      const defaultCapacity = appointmentConfig.services?.[0]?.capacity || 1;
      availableSlots = await getAvailableSlots(
        supabase,
        firebaseUid,
        date,
        appointmentConfig.business_hours.duration,
        defaultCapacity
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

// Get available time slots for a date (considering capacity)
async function getAvailableSlots(
  supabase: any,
  userId: string,
  date: string,
  duration: number,
  capacity: number = 1
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
      .select("appointment_business_hours, appointment_services")
      .eq("user_id", userId)
      .single();

    const businessHours = config?.appointment_business_hours || {
      start: "09:00",
      end: "18:00",
      duration: 60,
    };

    // Get default capacity from services config
    const services = config?.appointment_services || [];
    const defaultCapacity = services[0]?.capacity || capacity;

    const startMinutes = parseTime(businessHours.start);
    const endMinutes = parseTime(businessHours.end);
    const slotDuration = businessHours.duration || duration;

    // Count bookings per time slot
    const bookingsPerSlot: Record<string, number> = {};
    for (const apt of appointments || []) {
      const timeStr = apt.time;
      bookingsPerSlot[timeStr] = (bookingsPerSlot[timeStr] || 0) + 1;
    }

    // Generate available slots (only those under capacity)
    const availableSlots: string[] = [];

    for (
      let time = startMinutes;
      time + slotDuration <= endMinutes;
      time += slotDuration
    ) {
      const timeStr = formatTime(time);
      const currentBookings = bookingsPerSlot[timeStr] || 0;

      // Slot is available if under capacity
      if (currentBookings < defaultCapacity) {
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
