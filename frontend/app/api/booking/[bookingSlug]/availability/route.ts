import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// Types
// ============================================================
interface TimeSlot {
  time: string;
  available: boolean;
  capacity: number;
  totalStaff: number;
}

interface Booking {
  id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
}

interface StaffMember {
  id: string;
  name: string;
  is_active: boolean;
  inherit_business_hours: boolean;
  work_schedule: Record<
    string,
    { start: string; end: string; enabled: boolean }
  > | null;
}

// ============================================================
// GET /api/booking/[bookingSlug]/availability
// Check available time slots with staff-based capacity
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookingSlug: string }> },
) {
  try {
    const { bookingSlug } = await params;
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const serviceId = searchParams.get("service_id");
    const preferredStaffId = searchParams.get("staff_id");

    if (!dateStr) {
      return NextResponse.json(
        { success: false, error: "Date is required" },
        { status: 400 },
      );
    }

    // Look up business
    const { data: business } = await supabase
      .from("businesses")
      .select("user_id, timezone")
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Booking page not found" },
        { status: 404 },
      );
    }

    // Get booking configuration - check store_capabilities first, then ai_capabilities
    // hours can be either:
    // - Flat format: {start: "09:00", end: "18:00", duration: 60} (from ai_capabilities/bot-settings)
    // - Per-day format: {monday: {start, end, enabled}, ...} (from store_capabilities)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hours: any = {};
    let slotGranularity = 30;
    let globalBuffer = 0;
    let staffSelectionMode = "auto";

    const { data: capabilities } = await supabase
      .from("store_capabilities")
      .select(
        "booking_hours, booking_slot_duration, booking_buffer_minutes, staff_selection_mode",
      )
      .eq("user_id", business.user_id)
      .maybeSingle();

    if (
      capabilities?.booking_hours &&
      Object.keys(capabilities.booking_hours).length > 0
    ) {
      hours = capabilities.booking_hours;
      slotGranularity = capabilities.booking_slot_duration || 30;
      globalBuffer = capabilities.booking_buffer_minutes || 0;
      staffSelectionMode = capabilities.staff_selection_mode || "auto";
    } else {
      // Fallback: Check ai_capabilities (bot-settings saves timing here)
      const { data: aiCaps } = await supabase
        .from("ai_capabilities")
        .select("appointment_business_hours")
        .eq("user_id", business.user_id)
        .maybeSingle();

      if (aiCaps?.appointment_business_hours) {
        hours = aiCaps.appointment_business_hours;
      }
    }

    // DEBUG: Log hours data for troubleshooting
    console.log("[Availability] Hours from DB:", JSON.stringify(hours));
    console.log("[Availability] Date requested:", dateStr);

    // Get service details
    let serviceDuration = 60;
    let bufferBefore = 0;
    let bufferAfter = 0;

    if (serviceId) {
      const { data: service } = await supabase
        .from("services")
        .select("duration_minutes, buffer_before, buffer_after")
        .eq("id", serviceId)
        .eq("user_id", business.user_id)
        .maybeSingle();

      if (service) {
        serviceDuration = service.duration_minutes || 60;
        bufferBefore = service.buffer_before || 0;
        bufferAfter = service.buffer_after || 0;
      }
    }

    const totalBlockMinutes =
      bufferBefore + serviceDuration + bufferAfter + globalBuffer;

    // DEBUG: Log service and block calculations
    console.log(
      "[Availability] serviceDuration:",
      serviceDuration,
      "bufferBefore:",
      bufferBefore,
      "bufferAfter:",
      bufferAfter,
      "globalBuffer:",
      globalBuffer,
    );
    console.log("[Availability] totalBlockMinutes:", totalBlockMinutes);

    // Get day of week
    const date = new Date(dateStr);
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const dayName = dayNames[date.getDay()];

    // Handle different business hours formats:
    // Format 1 (bot-settings/ai_capabilities): {start: "09:00", end: "18:00", duration: 60}
    // Format 2 (store_capabilities): {monday: {start: "09:00", end: "18:00", enabled: true}, ...}
    let dayStart: string | null = null;
    let dayEnd: string | null = null;
    let isOpen = false;

    // Check if hours has per-day structure (Format 2)
    if (
      hours[dayName] &&
      typeof hours[dayName] === "object" &&
      "start" in hours[dayName]
    ) {
      const perDayHours = hours[dayName] as {
        start: string;
        end: string;
        enabled?: boolean;
      };
      dayStart = perDayHours.start;
      dayEnd = perDayHours.end;
      isOpen = perDayHours.enabled !== false; // Default to open if enabled is not specified
    }
    // Check if hours has flat structure (Format 1 from bot-settings)
    else if (hours.start && hours.end) {
      dayStart = hours.start as string;
      dayEnd = hours.end as string;
      // Flat format means open every day (no per-day toggle)
      isOpen = true;
      // Also get duration from flat format if available
      if ((hours as { duration?: number }).duration) {
        slotGranularity =
          (hours as { duration?: number }).duration || slotGranularity;
      }
    }

    // DEBUG: Log format detection
    console.log("[Availability] Day name:", dayName);
    console.log(
      "[Availability] Per-day check (hours[dayName]):",
      hours[dayName],
    );
    console.log(
      "[Availability] Flat check (hours.start/end):",
      hours.start,
      hours.end,
    );
    console.log(
      "[Availability] isOpen:",
      isOpen,
      "dayStart:",
      dayStart,
      "dayEnd:",
      dayEnd,
    );

    if (!isOpen || !dayStart || !dayEnd) {
      console.log(
        "[Availability] Returning CLOSED - isOpen:",
        isOpen,
        "dayStart:",
        dayStart,
        "dayEnd:",
        dayEnd,
      );
      return NextResponse.json({
        success: true,
        slots: [],
        message: "Business is closed on this day",
        debug: { hours, dayName, isOpen, dayStart, dayEnd },
      });
    }

    // Create dayHours object for consistency
    const dayHours = { start: dayStart, end: dayEnd, enabled: isOpen };

    // Get staff who can perform this service
    let staffMembers: StaffMember[] = [];

    if (serviceId) {
      const { data: staffWithAssignments } = await supabase
        .from("staff")
        .select(
          `
          id, name, is_active, inherit_business_hours, work_schedule,
          staff_service_assignments!inner(service_id)
        `,
        )
        .eq("user_id", business.user_id)
        .eq("is_active", true)
        .eq("staff_service_assignments.service_id", serviceId);

      staffMembers = staffWithAssignments || [];
    } else {
      // No service specified - get all active staff
      const { data: allStaff } = await supabase
        .from("staff")
        .select("id, name, is_active, inherit_business_hours, work_schedule")
        .eq("user_id", business.user_id)
        .eq("is_active", true);

      staffMembers = allStaff || [];
    }

    // If preferring a specific staff, filter
    if (preferredStaffId) {
      staffMembers = staffMembers.filter((s) => s.id === preferredStaffId);
    }

    // Legacy fallback: if no staff, use simple slot generation
    if (staffMembers.length === 0) {
      // WORLD-CLASS FIX: Use SERVICE DURATION as slot granularity
      // 30-min service = 30-min intervals (09:00, 09:30, 10:00)
      // 60-min service = 60-min intervals (09:00, 10:00, 11:00)
      const actualSlotGranularity = serviceDuration; // Use service duration as granularity!

      console.log(
        "[Availability] Legacy mode - serviceDuration:",
        serviceDuration,
        "slotGranularity (from service):",
        actualSlotGranularity,
      );

      const slots = generateLegacySlots(
        dateStr,
        dayHours,
        serviceDuration + globalBuffer,
        actualSlotGranularity, // Use service duration as slot interval
        business.user_id,
      );
      return NextResponse.json({
        success: true,
        slots: await checkLegacyAvailability(
          slots,
          dateStr,
          business.user_id,
          serviceDuration + globalBuffer, // Pass total block time for overlap check
        ),
        slotDuration: serviceDuration,
        staffSelectionMode,
      });
    }

    // BATCH FETCH: Get all bookings for all staff on this date
    const staffIds = staffMembers.map((s) => s.id);
    const { data: existingBookings } = await supabase
      .from("appointments")
      .select("id, staff_id, starts_at, ends_at")
      .eq("user_id", business.user_id)
      .neq("status", "cancelled")
      .in("staff_id", staffIds)
      .gte("starts_at", `${dateStr}T00:00:00`)
      .lt("starts_at", `${dateStr}T23:59:59`);

    // CRITICAL: Also fetch UNASSIGNED bookings (staff_id IS NULL)
    // These block ALL staff since they weren't assigned to anyone
    const { data: unassignedBookings } = await supabase
      .from("appointments")
      .select("id, staff_id, starts_at, ends_at")
      .eq("user_id", business.user_id)
      .neq("status", "cancelled")
      .is("staff_id", null)
      .gte("starts_at", `${dateStr}T00:00:00`)
      .lt("starts_at", `${dateStr}T23:59:59`);

    console.log(
      `[Staff Availability] Staff bookings: ${(existingBookings || []).length}, Unassigned bookings: ${(unassignedBookings || []).length}`,
    );

    const bookingsByStaff = new Map<string, Booking[]>();
    // Store unassigned bookings under special key to check against all staff
    const unassignedBookingsList: Booking[] = (unassignedBookings ||
      []) as Booking[];

    staffIds.forEach((id) => bookingsByStaff.set(id, []));
    (existingBookings || []).forEach((booking: Booking) => {
      if (booking.staff_id) {
        const staffBookings = bookingsByStaff.get(booking.staff_id) || [];
        staffBookings.push(booking);
        bookingsByStaff.set(booking.staff_id, staffBookings);
      }
    });

    // Generate time slots with capacity
    const startTime = parseTime(dayHours.start);
    const endTime = parseTime(dayHours.end);
    const slots: TimeSlot[] = [];

    let currentMinutes = startTime.hours * 60 + startTime.minutes;
    const endMinutes = endTime.hours * 60 + endTime.minutes;

    while (currentMinutes + totalBlockMinutes <= endMinutes) {
      const slotHours = Math.floor(currentMinutes / 60);
      const slotMins = currentMinutes % 60;
      const timeStr = `${slotHours.toString().padStart(2, "0")}:${slotMins.toString().padStart(2, "0")}`;

      // Check if slot is in the past
      const isPast = isTimeInPast(date, slotHours, slotMins);

      if (isPast) {
        slots.push({
          time: timeStr,
          available: false,
          capacity: 0,
          totalStaff: staffMembers.length,
        });
        currentMinutes += serviceDuration; // Use service duration as slot interval
        continue;
      }

      // Calculate slot start/end times
      const slotStartTime = new Date(dateStr);
      slotStartTime.setHours(slotHours, slotMins, 0, 0);
      const slotEndTime = new Date(
        slotStartTime.getTime() + totalBlockMinutes * 60 * 1000,
      );

      // Count available staff for this slot
      let availableCount = 0;

      for (const staff of staffMembers) {
        // Check staff-specific hours
        let staffHours: { start: string; end: string; enabled: boolean } =
          dayHours;
        if (!staff.inherit_business_hours && staff.work_schedule?.[dayName]) {
          staffHours = staff.work_schedule[dayName] as typeof staffHours;
        }

        if (!staffHours.enabled) continue;

        const staffStart = parseTime(staffHours.start);
        const staffEnd = parseTime(staffHours.end);
        const staffStartMins = staffStart.hours * 60 + staffStart.minutes;
        const staffEndMins = staffEnd.hours * 60 + staffEnd.minutes;

        // DEBUG: Log first slot's staff hours check
        if (currentMinutes === startTime.hours * 60 + startTime.minutes) {
          console.log("[Availability] First slot check - staff:", staff.name);
          console.log("[Availability] staffHours:", staffHours);
          console.log(
            "[Availability] currentMinutes:",
            currentMinutes,
            "totalBlockMinutes:",
            totalBlockMinutes,
          );
          console.log(
            "[Availability] staffStartMins:",
            staffStartMins,
            "staffEndMins:",
            staffEndMins,
          );
          console.log(
            "[Availability] Check: currentMinutes < staffStartMins:",
            currentMinutes < staffStartMins,
          );
          console.log(
            "[Availability] Check: currentMinutes + totalBlockMinutes > staffEndMins:",
            currentMinutes + totalBlockMinutes,
            ">",
            staffEndMins,
            "=",
            currentMinutes + totalBlockMinutes > staffEndMins,
          );
        }

        // Check if slot is within staff's working hours
        if (
          currentMinutes < staffStartMins ||
          currentMinutes + totalBlockMinutes > staffEndMins
        ) {
          continue;
        }

        // Check for booking conflicts (in-memory, no DB call)
        const staffBookings = bookingsByStaff.get(staff.id) || [];

        // Check staff-specific bookings
        const hasStaffConflict = staffBookings.some((booking) => {
          const bookingStart = new Date(booking.starts_at).getTime();
          const bookingEnd = new Date(booking.ends_at).getTime();
          return (
            slotStartTime.getTime() < bookingEnd &&
            slotEndTime.getTime() > bookingStart
          );
        });

        // CRITICAL: Also check unassigned bookings (these block ALL staff)
        const hasUnassignedConflict = unassignedBookingsList.some((booking) => {
          const bookingStart = new Date(booking.starts_at).getTime();
          const bookingEnd = new Date(booking.ends_at).getTime();
          return (
            slotStartTime.getTime() < bookingEnd &&
            slotEndTime.getTime() > bookingStart
          );
        });

        const hasConflict = hasStaffConflict || hasUnassignedConflict;

        if (!hasConflict) {
          availableCount++;
        }
      }

      slots.push({
        time: timeStr,
        available: availableCount > 0,
        capacity: availableCount,
        totalStaff: staffMembers.length,
      });

      currentMinutes += serviceDuration; // Use service duration as slot interval
    }

    return NextResponse.json({
      success: true,
      slots,
      slotDuration: serviceDuration,
      staffSelectionMode,
      staffCount: staffMembers.length,
    });
  } catch (error) {
    console.error("[Availability API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ============================================================
// Helpers
// ============================================================
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

function isTimeInPast(date: Date, hours: number, minutes: number): boolean {
  const now = new Date();
  const slotTime = new Date(date);
  slotTime.setHours(hours, minutes, 0, 0);
  return slotTime < now;
}

// Legacy slot generation for businesses without staff
function generateLegacySlots(
  dateStr: string,
  dayHours: { start: string; end: string },
  slotDuration: number,
  granularity: number,
  _userId: string,
): { time: string }[] {
  const startTime = parseTime(dayHours.start);
  const endTime = parseTime(dayHours.end);
  const slots: { time: string }[] = [];

  let currentMinutes = startTime.hours * 60 + startTime.minutes;
  const endMinutes = endTime.hours * 60 + endTime.minutes;
  const date = new Date(dateStr);

  while (currentMinutes + slotDuration <= endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;

    if (!isTimeInPast(date, hours, mins)) {
      slots.push({
        time: `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`,
      });
    }

    currentMinutes += granularity;
  }

  return slots;
}

/**
 * Enterprise-grade availability check using proper datetime overlap detection.
 * A slot is unavailable if it overlaps with ANY existing appointment:
 * Overlap occurs when: slotStart < appointmentEnd AND slotEnd > appointmentStart
 */
async function checkLegacyAvailability(
  slots: { time: string }[],
  dateStr: string,
  userId: string,
  slotDurationMinutes: number = 60,
): Promise<TimeSlot[]> {
  // Fetch ALL non-cancelled appointments for this date with their time ranges
  // Use OR to match either legacy 'date' column OR new 'starts_at' within date range
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("id, starts_at, ends_at, date, time, duration")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .or(
      `date.eq.${dateStr},and(starts_at.gte.${dateStr}T00:00:00,starts_at.lt.${dateStr}T23:59:59)`,
    );

  // Build list of booked time ranges
  interface BookedRange {
    start: number; // timestamp
    end: number; // timestamp
  }
  const bookedRanges: BookedRange[] = [];

  (existingAppointments || []).forEach((apt) => {
    let startTime: number;
    let endTime: number;

    if (apt.starts_at && apt.ends_at) {
      // New format: use starts_at and ends_at directly
      startTime = new Date(apt.starts_at).getTime();
      endTime = new Date(apt.ends_at).getTime();
    } else if (apt.date && apt.time) {
      // Legacy format: calculate from date + time + duration
      const aptDateTime = new Date(`${apt.date}T${apt.time}`);
      startTime = aptDateTime.getTime();
      endTime = startTime + (apt.duration || 60) * 60 * 1000;
    } else {
      return; // Skip invalid appointments
    }

    bookedRanges.push({ start: startTime, end: endTime });
  });

  console.log(
    `[Legacy Availability] Date: ${dateStr}, Found ${bookedRanges.length} booked ranges`,
  );

  return slots.map((slot) => {
    // Calculate this slot's time range
    const slotStart = new Date(`${dateStr}T${slot.time}:00`).getTime();
    const slotEnd = slotStart + slotDurationMinutes * 60 * 1000;

    // Check for overlap with ANY existing appointment
    // Overlap formula: slotStart < aptEnd AND slotEnd > aptStart
    const hasOverlap = bookedRanges.some((range) => {
      const overlaps = slotStart < range.end && slotEnd > range.start;
      if (overlaps) {
        console.log(
          `[Legacy Availability] Slot ${slot.time} overlaps with booking [${new Date(range.start).toISOString()} - ${new Date(range.end).toISOString()}]`,
        );
      }
      return overlaps;
    });

    return {
      time: slot.time,
      available: !hasOverlap,
      capacity: hasOverlap ? 0 : 1,
      totalStaff: 1,
    };
  });
}
