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

// Appointment field configuration type
interface AppointmentField {
  id: string;
  label: string;
  type: "text" | "phone" | "email" | "date" | "time" | "textarea" | "select";
  required: boolean;
  order: number;
  options?: string[];
  placeholder?: string;
}

// Business hours configuration type
interface BusinessHours {
  start: string;
  end: string;
  duration: number;
  buffer?: number;
}

// Default appointment fields
const DEFAULT_APPOINTMENT_FIELDS: AppointmentField[] = [
  { id: "name", label: "Full Name", type: "text", required: true, order: 1 },
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
];

// Default business hours
const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: "09:00",
  end: "18:00",
  duration: 60,
  buffer: 0,
};

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
      appointment_fields: DEFAULT_APPOINTMENT_FIELDS,
      appointment_business_hours: DEFAULT_BUSINESS_HOURS,
      appointment_minimal_mode: false,
    };

    // Ensure defaults are set for any missing fields
    if (!capabilities.appointment_fields) {
      capabilities.appointment_fields = DEFAULT_APPOINTMENT_FIELDS;
    }
    if (!capabilities.appointment_business_hours) {
      capabilities.appointment_business_hours = DEFAULT_BUSINESS_HOURS;
    }
    if (capabilities.appointment_minimal_mode === undefined) {
      capabilities.appointment_minimal_mode = false;
    }

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
    const {
      appointment_booking_enabled,
      appointment_fields,
      appointment_business_hours,
      appointment_minimal_mode,
    } = body;

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    // Validate and add appointment_booking_enabled
    if (typeof appointment_booking_enabled === "boolean") {
      updateData.appointment_booking_enabled = appointment_booking_enabled;
    }

    // Validate and add appointment_fields
    if (Array.isArray(appointment_fields)) {
      // Validate each field has required properties
      const isValid = appointment_fields.every(
        (field: AppointmentField) =>
          field.id &&
          field.label &&
          field.type &&
          typeof field.required === "boolean" &&
          typeof field.order === "number"
      );
      if (isValid) {
        updateData.appointment_fields = appointment_fields;
      }
    }

    // Validate and add appointment_business_hours
    if (
      appointment_business_hours &&
      typeof appointment_business_hours === "object"
    ) {
      const { start, end, duration } = appointment_business_hours;
      if (start && end && typeof duration === "number") {
        updateData.appointment_business_hours = appointment_business_hours;
      }
    }

    // Validate and add appointment_minimal_mode
    if (typeof appointment_minimal_mode === "boolean") {
      updateData.appointment_minimal_mode = appointment_minimal_mode;
    }

    // Check if we have at least one valid field to update
    if (Object.keys(updateData).length <= 2) {
      // Only user_id and updated_at
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Upsert AI capabilities
    const { data, error } = await supabase
      .from("ai_capabilities")
      .upsert(updateData, {
        onConflict: "user_id",
      })
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
