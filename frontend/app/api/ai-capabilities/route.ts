import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";

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

// Order field configuration type (same structure as AppointmentField)
interface OrderField {
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

// Service configuration type
interface ServiceConfig {
  id: string;
  name: string;
  duration: number; // in minutes
  capacity: number; // max customers per slot
  price?: number;
  description?: string;
}

// Default services
const DEFAULT_SERVICES: ServiceConfig[] = [
  { id: "default", name: "General Appointment", duration: 60, capacity: 1 },
];

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

// Default order fields
const DEFAULT_ORDER_FIELDS: OrderField[] = [
  { id: "name", label: "Full Name", type: "text", required: true, order: 1 },
  {
    id: "phone",
    label: "Phone Number",
    type: "phone",
    required: true,
    order: 2,
  },
  {
    id: "address",
    label: "Delivery Address",
    type: "textarea",
    required: true,
    order: 3,
  },
  {
    id: "notes",
    label: "Order Notes",
    type: "textarea",
    required: false,
    order: 4,
  },
];

// Helper to get user ID from Firebase token
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success) {
      // Don't log routine session expiry/invalid errors
      return null;
    }
    return result.data!.uid;
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
      appointment_services: DEFAULT_SERVICES,
      order_booking_enabled: false,
      order_fields: DEFAULT_ORDER_FIELDS,
      order_minimal_mode: false,
      order_sheet_url: null,
      order_sheet_sync_enabled: false,
      products_enabled: false,
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
    if (
      !capabilities.appointment_services ||
      capabilities.appointment_services.length === 0
    ) {
      capabilities.appointment_services = DEFAULT_SERVICES;
    }
    // Ensure order defaults
    if (capabilities.order_booking_enabled === undefined) {
      capabilities.order_booking_enabled = false;
    }
    if (!capabilities.order_fields) {
      capabilities.order_fields = DEFAULT_ORDER_FIELDS;
    }
    if (capabilities.order_minimal_mode === undefined) {
      capabilities.order_minimal_mode = false;
    }
    // Ensure products defaults
    if (capabilities.products_enabled === undefined) {
      capabilities.products_enabled = false;
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
      appointment_services,
      order_booking_enabled,
      order_fields,
      order_minimal_mode,
      order_sheet_url,
      order_sheet_sync_enabled,
      products_enabled,
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

    // Validate and add appointment_services
    if (Array.isArray(appointment_services)) {
      // Validate each service has required properties
      const isValid = appointment_services.every(
        (service: ServiceConfig) =>
          service.id &&
          service.name !== undefined &&
          typeof service.duration === "number" &&
          typeof service.capacity === "number" &&
          service.capacity >= 1
      );
      if (isValid) {
        updateData.appointment_services = appointment_services;
      }
    }

    // Validate and add order_booking_enabled
    if (typeof order_booking_enabled === "boolean") {
      updateData.order_booking_enabled = order_booking_enabled;
    }

    // Validate and add order_fields
    if (Array.isArray(order_fields)) {
      // Validate each field has required properties
      const isValid = order_fields.every(
        (field: OrderField) =>
          field.id &&
          field.label &&
          field.type &&
          typeof field.required === "boolean" &&
          typeof field.order === "number"
      );
      if (isValid) {
        updateData.order_fields = order_fields;
      }
    }

    // Validate and add order_minimal_mode
    if (typeof order_minimal_mode === "boolean") {
      updateData.order_minimal_mode = order_minimal_mode;
    }

    // Validate and add order_sheet_url
    if (order_sheet_url !== undefined) {
      updateData.order_sheet_url = order_sheet_url;
    }

    // Validate and add order_sheet_sync_enabled
    if (typeof order_sheet_sync_enabled === "boolean") {
      updateData.order_sheet_sync_enabled = order_sheet_sync_enabled;
    }

    // Validate and add products_enabled
    if (typeof products_enabled === "boolean") {
      updateData.products_enabled = products_enabled;
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
