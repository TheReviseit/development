import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  try {
    const { storeSlug } = await params;

    if (!storeSlug) {
      return NextResponse.json(
        { error: "Store slug is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    // Get business by user_id (storeSlug is the user_id)
    const { data, error } = await supabase
      .from("businesses")
      .select("razorpay_key_id, payments_enabled, business_name")
      .eq("user_id", storeSlug)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Only return public key (NOT the secret!)
    return NextResponse.json({
      success: true,
      paymentsEnabled: data.payments_enabled || false,
      razorpayKeyId: data.razorpay_key_id || null, // Public key only
      storeName: data.business_name || "Store",
    });
  } catch (error) {
    console.error("Error fetching store payment settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment settings" },
      { status: 500 },
    );
  }
}
