import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Validation helpers
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

// GET: List all services for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const supabase = getSupabase();

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") === "true";
    const category = searchParams.get("category");

    let query = supabase
      .from("services")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching services:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch services" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Services GET error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST: Create a new service
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
    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { success: false, error: "Service name is required" },
        { status: 400 },
      );
    }

    const priceType = body.price_type || "fixed";
    if (!validatePriceType(priceType)) {
      return NextResponse.json(
        { success: false, error: "Invalid price type" },
        { status: 400 },
      );
    }

    const paymentMode = body.payment_mode || "both";
    if (!validatePaymentMode(paymentMode)) {
      return NextResponse.json(
        { success: false, error: "Invalid payment mode" },
        { status: 400 },
      );
    }

    // Validate location type if provided
    const locationType = body.location_type || "business";
    if (!validateLocationType(locationType)) {
      return NextResponse.json(
        { success: false, error: "Invalid location type" },
        { status: 400 },
      );
    }

    // Build service data
    const serviceData = {
      user_id: userId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      image_url: body.image_url || null,
      image_public_id: body.image_public_id || null,
      price_type: priceType,
      price_amount:
        priceType === "fixed" || priceType === "hourly"
          ? body.price_amount
          : null,
      price_range_min: priceType === "variable" ? body.price_range_min : null,
      price_range_max: priceType === "variable" ? body.price_range_max : null,
      min_billable_minutes:
        priceType === "hourly" ? body.min_billable_minutes || 60 : 60,
      duration_enabled: body.duration_enabled || false,
      duration_minutes: body.duration_enabled ? body.duration_minutes : null,
      max_bookings_per_slot: body.max_bookings_per_slot || 1,
      buffer_before: body.buffer_before || 0,
      buffer_after: body.buffer_after || 0,
      location_type: locationType,
      category: body.category?.trim() || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      payment_mode: paymentMode,
      is_active: body.is_active !== false,
      display_order: body.display_order || 0,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("services")
      .insert(serviceData)
      .select()
      .single();

    if (error) {
      console.error("Error creating service:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create service" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Services POST error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
