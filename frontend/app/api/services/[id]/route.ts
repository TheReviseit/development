import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { deleteServiceImage } from "@/lib/cloudinary";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function validatePriceType(priceType: string): boolean {
  return ["fixed", "variable", "hourly"].includes(priceType);
}

function validatePaymentMode(paymentMode: string): boolean {
  return ["online", "cash", "both"].includes(paymentMode);
}

function validateLocationType(locationType: string): boolean {
  return ["business", "customer", "online"].includes(locationType);
}

// Helper to get user ID from session
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) {
      return null;
    }
    return result.data.uid;
  } catch {
    return null;
  }
}

// GET: Get a single service by ID
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
      .from("services")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "Service not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Service GET error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT: Update a service
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
      .from("services")
      .select("id, image_public_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Service not found" },
        { status: 404 },
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }
    if (body.image_url !== undefined) {
      // If image changed and old image exists, delete from Cloudinary
      if (
        existing.image_public_id &&
        body.image_public_id !== existing.image_public_id
      ) {
        await deleteServiceImage(existing.image_public_id);
      }
      updateData.image_url = body.image_url;
      updateData.image_public_id = body.image_public_id;
    }
    if (body.price_type !== undefined) {
      if (!validatePriceType(body.price_type)) {
        return NextResponse.json(
          { success: false, error: "Invalid price type" },
          { status: 400 },
        );
      }
      updateData.price_type = body.price_type;
    }
    if (body.price_amount !== undefined) {
      updateData.price_amount = body.price_amount;
    }
    if (body.price_range_min !== undefined) {
      updateData.price_range_min = body.price_range_min;
    }
    if (body.price_range_max !== undefined) {
      updateData.price_range_max = body.price_range_max;
    }
    if (body.duration_enabled !== undefined) {
      updateData.duration_enabled = body.duration_enabled;
    }
    if (body.duration_minutes !== undefined) {
      updateData.duration_minutes = body.duration_minutes;
    }
    if (body.category !== undefined) {
      updateData.category = body.category?.trim() || null;
    }
    if (body.payment_mode !== undefined) {
      if (!validatePaymentMode(body.payment_mode)) {
        return NextResponse.json(
          { success: false, error: "Invalid payment mode" },
          { status: 400 },
        );
      }
      updateData.payment_mode = body.payment_mode;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }
    if (body.display_order !== undefined) {
      updateData.display_order = body.display_order;
    }
    // New fields
    if (body.max_bookings_per_slot !== undefined) {
      updateData.max_bookings_per_slot = body.max_bookings_per_slot;
    }
    if (body.buffer_before !== undefined) {
      updateData.buffer_before = body.buffer_before;
    }
    if (body.buffer_after !== undefined) {
      updateData.buffer_after = body.buffer_after;
    }
    if (body.location_type !== undefined) {
      if (!validateLocationType(body.location_type)) {
        return NextResponse.json(
          { success: false, error: "Invalid location type" },
          { status: 400 },
        );
      }
      updateData.location_type = body.location_type;
    }
    if (body.min_billable_minutes !== undefined) {
      updateData.min_billable_minutes = body.min_billable_minutes;
    }
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags) ? body.tags : [];
    }

    const { data, error } = await supabase
      .from("services")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating service:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update service" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Service PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE: Delete a service
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

    // Get service to delete image from Cloudinary
    const { data: existing } = await supabase
      .from("services")
      .select("id, image_public_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Service not found" },
        { status: 404 },
      );
    }

    // Delete image from Cloudinary if exists
    if (existing.image_public_id) {
      await deleteServiceImage(existing.image_public_id);
    }

    // Delete from database
    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting service:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete service" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Service DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
