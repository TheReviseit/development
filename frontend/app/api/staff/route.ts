import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user ID from session
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return null;

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) return null;
    return result.data.uid;
  } catch {
    return null;
  }
}

// GET: List all staff members
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabase();

    // First, ensure default staff exists (auto-create for new businesses)
    const { data: existingStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (!existingStaff || existingStaff.length === 0) {
      // Auto-create default "Owner/Self" staff
      await supabase.from("staff").insert({
        user_id: userId,
        name: "Owner",
        is_active: true,
        is_default: true,
        inherit_business_hours: true,
      });
    }

    // Fetch all staff with their service assignments
    const { data: staff, error } = await supabase
      .from("staff")
      .select(
        `
        *,
        staff_service_assignments (
          service_id,
          custom_duration_minutes,
          priority
        )
      `,
      )
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching staff:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch staff" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("Staff GET error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST: Create new staff member
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Staff name is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    const staffData = {
      user_id: userId,
      name: body.name.trim(),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      avatar_url: body.avatar_url || null,
      is_active: body.is_active !== false,
      is_default: false,
      inherit_business_hours: body.inherit_business_hours !== false,
      work_schedule:
        body.inherit_business_hours !== false ? null : body.work_schedule,
      display_order: body.display_order || 0,
    };

    const { data, error } = await supabase
      .from("staff")
      .insert(staffData)
      .select()
      .single();

    if (error) {
      console.error("Error creating staff:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create staff" },
        { status: 500 },
      );
    }

    // If service_ids provided, create assignments
    if (body.service_ids && Array.isArray(body.service_ids)) {
      const assignments = body.service_ids.map((serviceId: string) => ({
        staff_id: data.id,
        service_id: serviceId,
        priority: 0,
      }));

      await supabase.from("staff_service_assignments").insert(assignments);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Staff POST error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
