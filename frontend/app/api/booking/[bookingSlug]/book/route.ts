import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// POST /api/booking/[bookingSlug]/book
// Create a new booking
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingSlug: string }> },
) {
  try {
    const { bookingSlug } = await params;
    const body = await request.json();
    const idempotencyKey = request.headers.get("X-Idempotency-Key");

    // Validate required fields
    const { service_id, starts_at, customer, notes } = body;

    if (!service_id || !starts_at || !customer?.name || !customer?.phone) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Look up business
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("user_id, business_name, timezone")
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    console.log(
      "[Book API] bookingSlug:",
      bookingSlug,
      "business:",
      business,
      "error:",
      bizError,
    );

    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Booking page not found",
          debug: { bookingSlug, bizError },
        },
        { status: 404 },
      );
    }

    // Check for idempotent request
    if (idempotencyKey) {
      const { data: existingBooking } = await supabase
        .from("appointments")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingBooking) {
        // Return existing booking (idempotent)
        return NextResponse.json({
          success: true,
          booking: formatBookingResponse(existingBooking, business),
          idempotent: true,
        });
      }
    }

    // Get service details - check services table first, then store_capabilities
    let serviceDuration = 60;
    let serviceName = "Appointment";
    let servicePrice = 0;
    let paymentMode: "online" | "cash" | "both" = "cash";

    // First try the services table
    const { data: dbService } = await supabase
      .from("services")
      .select("name, duration_minutes, price_amount, payment_mode")
      .eq("id", service_id)
      .eq("user_id", business.user_id)
      .maybeSingle();

    if (dbService) {
      serviceDuration = dbService.duration_minutes || 60;
      serviceName = dbService.name || "Appointment";
      servicePrice = dbService.price_amount || 0;
      paymentMode = dbService.payment_mode || "cash";
    } else {
      // Fallback: check store_capabilities
      const { data: capabilities } = await supabase
        .from("store_capabilities")
        .select(
          "booking_services, booking_reminder_times, booking_reminder_channels",
        )
        .eq("user_id", business.user_id)
        .maybeSingle();

      if (capabilities?.booking_services) {
        const service = capabilities.booking_services.find(
          (s: any) => s.id === service_id,
        );
        if (service) {
          serviceDuration = service.duration || 60;
          serviceName = service.name || "Appointment";
          servicePrice = service.price || 0;
        }
      }
    }

    // Calculate end time
    const startsAt = new Date(starts_at);
    const endsAt = new Date(startsAt.getTime() + serviceDuration * 60 * 1000);

    // Generate fingerprint for duplicate detection
    const fingerprint = generateFingerprint(
      business.user_id,
      customer.phone,
      startsAt.toISOString(),
      service_id,
    );

    // Check for duplicate booking (same phone, time, service within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: duplicateBooking } = await supabase
      .from("appointments")
      .select("id")
      .eq("fingerprint", fingerprint)
      .gte("created_at", fiveMinutesAgo.toISOString())
      .maybeSingle();

    if (duplicateBooking) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A similar booking was just made. Please wait before trying again.",
        },
        { status: 409 },
      );
    }

    // ENTERPRISE-GRADE: Find available staff and assign booking to them
    // Step 1: Get staff members who can perform this service
    let availableStaffId: string | null = null;
    let availableStaffName: string | null = null;

    const { data: staffMembers } = await supabase
      .from("staff")
      .select(
        `
        id, name, is_active,
        staff_service_assignments!inner(service_id)
      `,
      )
      .eq("user_id", business.user_id)
      .eq("is_active", true)
      .eq("staff_service_assignments.service_id", service_id);

    if (staffMembers && staffMembers.length > 0) {
      // Step 2: For each staff, check if they're available at this time
      for (const staff of staffMembers) {
        const { data: staffConflicts } = await supabase
          .from("appointments")
          .select("id")
          .eq("user_id", business.user_id)
          .eq("staff_id", staff.id)
          .neq("status", "cancelled")
          .lt("starts_at", endsAt.toISOString())
          .gt("ends_at", startsAt.toISOString());

        if (!staffConflicts || staffConflicts.length === 0) {
          // This staff is available!
          availableStaffId = staff.id;
          availableStaffName = staff.name;
          console.log(
            `[Book API] Found available staff: ${staff.name} (${staff.id})`,
          );
          break;
        }
      }

      if (!availableStaffId) {
        console.log("[Book API] No staff available for this slot");
        return NextResponse.json(
          {
            success: false,
            error:
              "This time slot is no longer available. All staff are booked.",
          },
          { status: 409 },
        );
      }
    } else {
      // No staff configured - check for ANY conflicting bookings (legacy mode)
      const { data: conflictingBookings } = await supabase
        .from("appointments")
        .select("id")
        .eq("user_id", business.user_id)
        .neq("status", "cancelled")
        .lt("starts_at", endsAt.toISOString())
        .gt("ends_at", startsAt.toISOString());

      if (conflictingBookings && conflictingBookings.length > 0) {
        console.log("[Book API] Slot conflict detected (legacy mode)");
        return NextResponse.json(
          {
            success: false,
            error: "This time slot is no longer available.",
          },
          { status: 409 },
        );
      }
    }

    // Generate cancel token
    const cancelToken = crypto.randomBytes(16).toString("hex");

    console.log("[Book API] Creating appointment:", {
      user_id: business.user_id,
      service_id,
      serviceName,
      servicePrice,
      startsAt: startsAt.toISOString(),
      customer: customer.name,
    });

    // Determine if this booking requires payment
    const requiresOnlinePayment = paymentMode !== "cash" && servicePrice > 0;

    // Set reservation timeout (15 minutes for online payments)
    const reservedUntil = requiresOnlinePayment
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;

    // Create the appointment in DRAFT status (only webhook confirms for online payment)
    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        user_id: business.user_id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email || null,
        // Required date/time fields
        date: startsAt.toISOString().split("T")[0],
        time: startsAt.toTimeString().split(" ")[0].substring(0, 5),
        duration: serviceDuration,
        // New-style datetime fields
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        timezone: business.timezone || "Asia/Kolkata",
        // Staff assignment (auto-assigned)
        staff_id: availableStaffId,
        provider_name: availableStaffName,
        // Service info
        service: serviceName,
        service_id: service_id,
        service_price: servicePrice,
        // Booking metadata
        source: "ai", // From online booking
        // ENTERPRISE FIX: Start as draft for online payments, confirmed for cash only
        status: requiresOnlinePayment ? "draft" : "confirmed",
        booking_status: requiresOnlinePayment ? "draft" : "confirmed",
        payment_status: requiresOnlinePayment
          ? "unpaid"
          : servicePrice > 0
            ? "pay_at_venue"
            : "free",
        reserved_until: reservedUntil,
        notes: notes || null,
        idempotency_key: idempotencyKey || null,
        fingerprint: fingerprint,
        cancel_token: cancelToken,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Booking API] Insert error:", insertError);

      // Check if it's a slot collision
      if (
        insertError.message?.includes("slot") ||
        insertError.code === "23505"
      ) {
        return NextResponse.json(
          { success: false, error: "This time slot is no longer available" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { success: false, error: "Failed to create booking" },
        { status: 500 },
      );
    }

    // Determine if payment is required
    const requiresPayment = paymentMode !== "cash" && servicePrice > 0;

    return NextResponse.json({
      success: true,
      booking: formatBookingResponse(appointment, business),
      payment: {
        mode: paymentMode,
        required: requiresPayment,
        amount: servicePrice,
      },
      reminders_scheduled: 3,
    });
  } catch (error) {
    console.error("[Booking API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// Helpers
// ============================================================
function generateFingerprint(
  userId: string,
  phone: string,
  startsAt: string,
  serviceId: string,
): string {
  const data = `${userId}:${phone}:${startsAt}:${serviceId}`;
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 32);
}

function formatBookingResponse(appointment: any, business: any) {
  return {
    id: appointment.id,
    booking_id: appointment.booking_id,
    status: appointment.status,
    starts_at: appointment.starts_at,
    ends_at: appointment.ends_at,
    service: {
      id: appointment.service_id,
      name: appointment.service,
      duration:
        appointment.ends_at && appointment.starts_at
          ? Math.round(
              (new Date(appointment.ends_at).getTime() -
                new Date(appointment.starts_at).getTime()) /
                60000,
            )
          : 60,
    },
    store: {
      name: business.businessName || business.business_name,
    },
    calendar_url: `/api/booking/calendar/${appointment.id}.ics`,
    cancel_url: `/booking/${business.booking_slug || business.user_id}/cancel/${appointment.id}?token=${appointment.cancel_token}`,
  };
}
