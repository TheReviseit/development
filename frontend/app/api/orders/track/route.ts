import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - Track orders by phone number (public endpoint, no auth required)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const storeSlug = searchParams.get("storeSlug");

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    if (!storeSlug) {
      return NextResponse.json(
        { error: "Store slug is required" },
        { status: 400 }
      );
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phone.replace(/\D/g, "");

    const supabase = getSupabase();

    // Fetch orders by phone number and store slug (user_id)
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", storeSlug)
      .ilike("customer_phone", `%${normalizedPhone}%`)
      .order("created_at", { ascending: false })
      .limit(50); // Limit to prevent abuse

    if (error) {
      console.error("Error fetching orders:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    // Also try with the original phone format
    let additionalData = null;
    if (phone !== normalizedPhone) {
      const { data: altData } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", storeSlug)
        .ilike("customer_phone", `%${phone}%`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (altData && altData.length > 0) {
        additionalData = altData;
      }
    }

    // Merge and deduplicate results
    const allOrders = data || [];
    if (additionalData) {
      const existingIds = new Set(allOrders.map((o) => o.id));
      additionalData.forEach((order) => {
        if (!existingIds.has(order.id)) {
          allOrders.push(order);
        }
      });
    }

    // Sort by created_at descending
    allOrders.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      success: true,
      data: allOrders.slice(0, 50), // Final limit
    });
  } catch (error) {
    console.error("Error in GET /api/orders/track:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
