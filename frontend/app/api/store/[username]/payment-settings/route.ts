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
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: "Store slug is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    // Get business by user_id (username is the user_id)
    const { data, error } = await supabase
      .from("businesses")
      .select(
        "razorpay_key_id, payments_enabled, business_name, ecommerce_policies",
      )
      .eq("user_id", username)
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
      shippingCharges:
        data.ecommerce_policies?.shipping_charges ||
        data.ecommerce_policies?.shippingCharges ||
        null,
      codAvailable:
        data.ecommerce_policies?.cod_available ??
        data.ecommerce_policies?.codAvailable ??
        false,
    });
  } catch (error) {
    console.error("Error fetching store payment settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment settings" },
      { status: 500 },
    );
  }
}
