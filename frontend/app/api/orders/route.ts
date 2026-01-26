import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

// Backend Flask API base URL (used for Google Sheets sync)
const BACKEND_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
      true,
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
}

// GET - List all orders for current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      console.log("📦 Orders API: No userId from session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`📦 Orders API: Fetching for user: ${userId}`);

    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    // Optional filters
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = searchParams.get("limit");

    let query = supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // Apply filters
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (limit) {
      query = query.limit(parseInt(limit));
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 },
      );
    }

    console.log(
      `📦 Orders API: Found ${data?.length || 0} orders for user ${userId}`,
    );

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("Error in GET /api/orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create a new order
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      customer_name,
      customer_phone,
    customer_address,
    customer_email,
      items,
      status = "pending",
      source = "manual",
      notes,
    } = body;

    // Validate required fields
    if (
      !customer_name ||
      !customer_phone ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customer_name, customer_phone, items (non-empty array)",
        },
        { status: 400 },
      );
    }

    // Validate items structure
    for (const item of items) {
      if (
        !item.name ||
        typeof item.quantity !== "number" ||
        item.quantity < 1
      ) {
        return NextResponse.json(
          { error: "Each item must have name and quantity (>= 1)" },
          { status: 400 },
        );
      }
    }

    // Calculate total quantity
    const total_quantity = items.reduce(
      (sum: number, item: OrderItem) => sum + item.quantity,
      0,
    );

    const supabase = getSupabase();

    // Create order
    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        customer_name,
        customer_phone,
        customer_address,
        customer_email,
        items,
        total_quantity,
        status,
        source,
        notes,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating order:", error);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 },
      );
    }

    console.log(`📦 Orders API: Created order ${data.id} for user ${userId}`);

    // Fire-and-forget: trigger Google Sheets sync via Flask backend.
    // Any failures here should NOT impact order creation for the customer.
    try {
      // Only attempt sync if we have an order id and user id.
      if (data?.id && userId) {
        // Do not await this fetch; log errors but keep response fast.
        fetch(`${BACKEND_URL}/api/orders/sheets/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": userId,
          },
          body: JSON.stringify({
            order_id: data.id,
            user_id: userId,
          }),
        }).catch((err) => {
          console.error("Error triggering Google Sheets sync:", err);
        });
      }
    } catch (err) {
      console.error("Error preparing Google Sheets sync:", err);
    }

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /api/orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
