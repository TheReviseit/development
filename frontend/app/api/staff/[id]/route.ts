import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

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

// GET: Get single staff member with assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
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
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "Staff not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Staff GET error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT: Update staff member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const supabase = getSupabase();

    // Verify ownership
    const { data: existing } = await supabase
      .from("staff")
      .select("id, is_default")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Staff not found" },
        { status: 404 },
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.email !== undefined) updateData.email = body.email?.trim() || null;
    if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.inherit_business_hours !== undefined) {
      updateData.inherit_business_hours = body.inherit_business_hours;
      if (body.inherit_business_hours) {
        updateData.work_schedule = null;
      }
    }
    if (body.work_schedule !== undefined)
      updateData.work_schedule = body.work_schedule;
    if (body.display_order !== undefined)
      updateData.display_order = body.display_order;

    const { data, error } = await supabase
      .from("staff")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating staff:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update staff" },
        { status: 500 },
      );
    }

    // Update service assignments if provided
    if (body.service_ids !== undefined && Array.isArray(body.service_ids)) {
      // Delete existing assignments
      await supabase
        .from("staff_service_assignments")
        .delete()
        .eq("staff_id", id);

      // Insert new assignments
      if (body.service_ids.length > 0) {
        const assignments = body.service_ids.map(
          (serviceId: string, idx: number) => ({
            staff_id: id,
            service_id: serviceId,
            priority: body.service_ids.length - idx, // Higher priority for earlier services
          }),
        );

        await supabase.from("staff_service_assignments").insert(assignments);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Staff PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE: Remove staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabase();

    // Check if this is the default staff
    const { data: existing } = await supabase
      .from("staff")
      .select("id, is_default")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Staff not found" },
        { status: 404 },
      );
    }

    // Prevent deletion of default staff (can only deactivate)
    if (existing.is_default) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete default staff. Deactivate instead.",
        },
        { status: 400 },
      );
    }

    // Staff service assignments are deleted via CASCADE
    const { error } = await supabase
      .from("staff")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting staff:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete staff" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Staff DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
