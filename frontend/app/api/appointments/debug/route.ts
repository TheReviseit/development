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

/**
 * GET /api/appointments/debug
 * 
 * Debug endpoint to diagnose appointment data issues.
 * Returns detailed information about:
 * - Current user's Firebase UID
 * - User record in Supabase
 * - All appointments for this user (unfiltered)
 * - AI capabilities for this user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ 
        error: "Unauthorized",
        debug: {
          message: "No session cookie found or invalid session"
        }
      }, { status: 401 });
    }

    const supabase = getSupabase();
    
    // 1. Get user record from Supabase
    const { data: userRecord, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("firebase_uid", userId)
      .single();

    // 2. Get ALL appointments for this user (no date filters)
    const { data: appointments, error: appointmentsError } = await supabase
      .from("appointments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // 3. Also check if there are appointments with any user_id containing this pattern
    // This helps identify if appointments exist but with wrong user_id
    const { data: allRecentAppointments, error: allError } = await supabase
      .from("appointments")
      .select("id, user_id, customer_name, date, time, source, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    // 4. Get AI capabilities
    const { data: aiCapabilities, error: aiError } = await supabase
      .from("ai_capabilities")
      .select("*")
      .eq("user_id", userId)
      .single();

    // 5. Check if user_id appears elsewhere
    const matchingUserIds = allRecentAppointments?.filter(
      apt => apt.user_id === userId
    ).length || 0;

    const nonMatchingUserIds = allRecentAppointments?.filter(
      apt => apt.user_id !== userId
    ).map(apt => ({
      id: apt.id,
      user_id: apt.user_id,
      user_id_length: apt.user_id?.length,
      customer_name: apt.customer_name,
      source: apt.source,
      created_at: apt.created_at
    })) || [];

    return NextResponse.json({
      success: true,
      debug: {
        current_user: {
          firebase_uid: userId,
          firebase_uid_length: userId.length,
          supabase_user_exists: !!userRecord,
          supabase_user_id: userRecord?.id || null,
        },
        user_record: userRecord ? {
          id: userRecord.id,
          firebase_uid: userRecord.firebase_uid,
          email: userRecord.email,
          full_name: userRecord.full_name,
        } : null,
        appointments: {
          count: appointments?.length || 0,
          items: appointments?.map(apt => ({
            id: apt.id,
            customer_name: apt.customer_name,
            date: apt.date,
            time: apt.time,
            status: apt.status,
            source: apt.source,
            user_id: apt.user_id,
            created_at: apt.created_at,
          })) || [],
          error: appointmentsError?.message || null,
        },
        recent_all_appointments: {
          matching_user_id_count: matchingUserIds,
          non_matching: nonMatchingUserIds,
          message: nonMatchingUserIds.length > 0 
            ? "⚠️ Found appointments with different user_ids - possible ID mismatch issue" 
            : "✅ No appointments with mismatched user_ids found",
        },
        ai_capabilities: {
          exists: !!aiCapabilities,
          appointment_booking_enabled: aiCapabilities?.appointment_booking_enabled || false,
          error: aiError?.message || null,
        },
        diagnosis: generateDiagnosis(userId, userRecord, appointments, nonMatchingUserIds),
      }
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

function generateDiagnosis(
  userId: string, 
  userRecord: any, 
  appointments: any[] | null,
  nonMatchingAppointments: any[]
): string[] {
  const issues: string[] = [];

  if (!userRecord) {
    issues.push("❌ User not found in Supabase users table - AI bookings may use wrong user_id");
  }

  if (!appointments || appointments.length === 0) {
    issues.push("ℹ️ No appointments found for this Firebase UID");
    
    if (nonMatchingAppointments.length > 0) {
      issues.push("⚠️ Found appointments with different user_ids - likely ID mismatch issue");
      issues.push(`   Mismatched user_ids: ${nonMatchingAppointments.map(a => a.user_id).join(", ")}`);
    }
  }

  if (appointments && appointments.length > 0) {
    issues.push(`✅ Found ${appointments.length} appointments for this user`);
    
    const aiAppointments = appointments.filter(a => a.source === "ai");
    const manualAppointments = appointments.filter(a => a.source === "manual");
    issues.push(`   - AI booked: ${aiAppointments.length}`);
    issues.push(`   - Manual: ${manualAppointments.length}`);
  }

  if (issues.length === 0) {
    issues.push("✅ No obvious issues detected");
  }

  return issues;
}

