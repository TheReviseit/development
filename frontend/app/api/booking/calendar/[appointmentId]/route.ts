import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// GET /api/booking/calendar/[appointmentId].ics
// Generate ICS calendar file for an appointment
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  try {
    let { appointmentId } = await params;

    // Remove .ics extension if present
    appointmentId = appointmentId.replace(/\.ics$/, "");

    // Fetch appointment
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select(
        "*, businesses!inner(businessName, business_name, location, address, city, state)",
      )
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 },
      );
    }

    // Build ICS content
    const icsContent = generateICS(appointment);

    // Return as downloadable file
    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="appointment-${appointment.booking_id || appointmentId}.ics"`,
      },
    });
  } catch (error) {
    console.error("[Calendar API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// Generate ICS Calendar Content
// ============================================================
function generateICS(appointment: any): string {
  const now = new Date();
  const uid = `${appointment.id}@flowauxi.com`;

  // Get start and end times
  const startTime = appointment.starts_at
    ? new Date(appointment.starts_at)
    : parseDateTime(appointment.appointment_date, appointment.appointment_time);

  let endTime: Date;
  if (appointment.ends_at) {
    endTime = new Date(appointment.ends_at);
  } else {
    // Default 1 hour if no end time
    endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  }

  // Format dates for ICS (YYYYMMDDTHHmmssZ)
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  // Get business info
  const businessName =
    appointment.businesses?.businessName ||
    appointment.businesses?.business_name ||
    "Appointment";

  let location = "";
  if (appointment.businesses?.location) {
    const loc = appointment.businesses.location;
    location = [loc.address, loc.city, loc.state].filter(Boolean).join(", ");
  } else if (appointment.businesses) {
    location = [
      appointment.businesses.address,
      appointment.businesses.city,
      appointment.businesses.state,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // Event summary and description
  const summary = `${appointment.service || "Appointment"} at ${businessName}`;
  const description = [
    `Service: ${appointment.service || "Appointment"}`,
    `Booking ID: ${appointment.booking_id || appointment.id}`,
    appointment.notes ? `Notes: ${appointment.notes}` : "",
  ]
    .filter(Boolean)
    .join("\\n");

  // Build ICS content
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flowauxi//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(startTime)}`,
    `DTEND:${formatDate(endTime)}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    location ? `LOCATION:${escapeICS(location)}` : "",
    "STATUS:CONFIRMED",
    // Reminders
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeICS(summary)} tomorrow`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeICS(summary)} in 2 hours`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${escapeICS(summary)} in 30 minutes`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

// ============================================================
// Helpers
// ============================================================
function parseDateTime(dateStr: string, timeStr: string): Date {
  const date = new Date(dateStr);
  if (timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
