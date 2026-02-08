import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// GET /api/booking/[bookingSlug]/appointment/[appointmentId]
// Fetch appointment details
// ============================================================
export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ bookingSlug: string; appointmentId: string }> },
) {
  try {
    const { bookingSlug, appointmentId } = await params;

    // Look up business
    const { data: business } = await supabase
      .from("businesses")
      .select(
        "user_id, businessName, business_name, location, address, city, state, phone",
      )
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Booking page not found" },
        { status: 404 },
      );
    }

    // Fetch appointment - try by UUID first, then by booking_id
    let appointment;

    // Check if appointmentId is a UUID
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        appointmentId,
      );

    if (isUUID) {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", appointmentId)
        .eq("user_id", business.user_id)
        .maybeSingle();
      appointment = data;
    }

    // If not found by UUID, try by booking_id
    if (!appointment) {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("booking_id", appointmentId)
        .eq("user_id", business.user_id)
        .maybeSingle();
      appointment = data;
    }

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 },
      );
    }

    // Build response
    const response = {
      success: true,
      data: {
        id: appointment.id,
        booking_id: appointment.booking_id,
        status: appointment.status,
        service: appointment.service,
        service_id: appointment.service_id,
        starts_at:
          appointment.starts_at ||
          combineDateTime(
            appointment.appointment_date,
            appointment.appointment_time,
          ),
        ends_at: appointment.ends_at,
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        customer_email: appointment.customer_email,
        notes: appointment.notes,
        store: {
          name: business.businessName || business.business_name,
          address:
            business.location?.address ||
            business.address ||
            [
              business.location?.city || business.city,
              business.location?.state || business.state,
            ]
              .filter(Boolean)
              .join(", "),
          phone: business.phone,
        },
        created_at: appointment.created_at,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Appointment API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// Helpers
// ============================================================
function combineDateTime(dateStr: string, timeStr: string): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date.toISOString();
}
