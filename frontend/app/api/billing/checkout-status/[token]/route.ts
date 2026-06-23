import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const maxDuration = 10;

/**
 * GET /api/billing/checkout-status/[token]
 * Supabase-direct poll — no Flask rewrite (Vercel free-tier safe).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json(
      { success: false, error: "Invalid checkout token", error_code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { success: false, error: "Server misconfiguration", error_code: "SERVER_MISCONFIG" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("checkout_requests")
    .select(
      "status, razorpay_subscription_id, razorpay_key_id, amount_paise, currency, target_plan_slug, error_message, checkout_token, id",
    )
    .eq("checkout_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Database error", error_code: "DATABASE_ERROR" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Checkout not found", error_code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const response: Record<string, unknown> = {
    success: true,
    status: data.status,
    checkout_id: data.id,
  };

  if (data.status === "completed") {
    const keyId =
      data.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const subscriptionId = data.razorpay_subscription_id;
    const amount = data.amount_paise;

    response.razorpay_subscription_id = subscriptionId;
    response.razorpay_key_id = keyId;
    response.amount_paise = amount;
    // Flask-compatible aliases for legacy clients
    response.subscription_id = subscriptionId;
    response.key_id = keyId;
    response.amount = amount;
    response.currency = data.currency || "INR";
    response.plan_name = data.target_plan_slug;
  }

  if (data.status === "failed") {
    response.error_message = data.error_message;
  }

  return NextResponse.json(response);
}
