import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
// React-PDF omitted (moved to Python backend)
import { randomUUID } from "crypto";
import { generateOrderId } from "@/lib/order-id";
import { resolveSlugToUserId } from "@/lib/resolve-slug";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  imageUrl?: string;
  size?: string;
  color?: string;
  notes?: string;
  product_id?: string;
  variant_id?: string;
}

interface InsufficientItem {
  name: string;
  requested: number;
  available: number;
  size?: string;
  color?: string;
}

// =============================================================================
// Order Source Types (Normalized for future-proofing)
// =============================================================================
type OrderSource =
  | "checkout_cod"
  | "checkout_online"
  | "whatsapp"
  | "manual"
  | "api"
  | "cod";

type PaymentMethod = "online" | "cod";
type PaymentStatus = "paid" | "pending" | "cod";

interface PaymentInfo {
  method: PaymentMethod;
  status: PaymentStatus;
}

/**
 * Determines payment info based on order source and notes.
 *
 * Business Rules:
 * - COD orders: method="cod", status="cod"
 * - Online (Razorpay) orders: method="online", status="paid" (only if Payment ID present)
 * - Manual/WhatsApp orders: treated as COD unless explicit payment proof
 *
 * @throws Error if invalid state detected (COD order with paid status)
 */
function getPaymentInfo(source: string, notes?: string): PaymentInfo {
  // Normalize source to lowercase
  const normalizedSource = source?.toLowerCase() || "manual";

  // Check for online payment proof (Razorpay payment ID in notes)
  const hasPaymentId =
    notes?.includes("Payment ID") || notes?.includes("razorpay_payment_id");

  // Determine if this is an online payment
  // Only "api" source WITH payment ID = confirmed online payment
  const isOnlinePayment = normalizedSource === "api" && hasPaymentId;

  // COD sources: explicit "cod", "checkout_cod", or any non-API source without payment ID
  const isCodOrder =
    normalizedSource === "cod" ||
    normalizedSource === "checkout_cod" ||
    !isOnlinePayment;

  const method: PaymentMethod = isOnlinePayment ? "online" : "cod";
  const status: PaymentStatus = isOnlinePayment ? "paid" : "cod";

  // Domain invariant: COD order can NEVER be marked as paid
  if (method === "cod" && status === "paid") {
    throw new Error("Invalid state: COD order cannot be marked as paid");
  }

  return { method, status };
}

// Validate stock availability for all items
// Based on schema:
// - Products have size_stocks JSONB like {"XXL": 2, "Free Size": 2}
// - Product variants have size_stocks JSONB like {"L": 30, "M": 30}
// - products.stock_quantity is often 0 when size_stocks is used
async function validateStockForOrder(
  supabase: ReturnType<typeof getSupabase>,
  username: string,
  items: OrderItem[],
): Promise<{ valid: boolean; insufficient?: InsufficientItem[] }> {
  const insufficient: InsufficientItem[] = [];

  for (const item of items) {
    // Try to find product by name if no product_id provided
    let productId = item.product_id;
    let product: any = null;

    if (!productId) {
      // Look up product by name
      const { data } = await supabase
        .from("products")
        .select("id, stock_quantity, size_stocks, has_size_pricing")
        .eq("user_id", username)
        .ilike("name", item.name)
        .single();

      if (data) {
        product = data;
        productId = data.id;
      }
    } else {
      // Fetch product by ID
      const { data } = await supabase
        .from("products")
        .select("id, stock_quantity, size_stocks, has_size_pricing")
        .eq("id", productId)
        .single();
      product = data;
    }

    if (!productId || !product) continue; // Can't validate without product

    let availableStock = 0;

    // Check if product has variants with matching color
    if (item.color) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, color, size_stocks, stock_quantity, has_size_pricing")
        .eq("product_id", productId)
        .eq("user_id", username)
        .eq("is_deleted", false);

      if (variants && variants.length > 0) {
        // Find matching variant by color (case-insensitive)
        const matchingVariant = variants.find(
          (v) => v.color?.toLowerCase() === item.color?.toLowerCase(),
        );

        if (matchingVariant) {
          // Parse size_stocks if it's a string
          let sizeStocks = matchingVariant.size_stocks;
          if (typeof sizeStocks === "string") {
            try {
              sizeStocks = JSON.parse(sizeStocks);
            } catch {
              sizeStocks = {};
            }
          }

          // Check size_stocks JSONB for specific size
          if (item.size && sizeStocks && typeof sizeStocks === "object") {
            // Try exact match first, then case-insensitive
            availableStock = sizeStocks[item.size] ?? 0;
            if (availableStock === 0) {
              const sizeKey = Object.keys(sizeStocks).find(
                (k) => k.toLowerCase() === item.size?.toLowerCase(),
              );
              if (sizeKey) availableStock = sizeStocks[sizeKey] ?? 0;
            }
          } else {
            // No size specified, use variant stock_quantity
            availableStock = matchingVariant.stock_quantity || 0;
          }
        }
      }
    }

    // If no variant stock found, check product-level size_stocks
    if (availableStock === 0 && item.size) {
      // Parse size_stocks if it's a string
      let sizeStocks = product.size_stocks;
      if (typeof sizeStocks === "string") {
        try {
          sizeStocks = JSON.parse(sizeStocks);
        } catch {
          sizeStocks = {};
        }
      }

      if (sizeStocks && typeof sizeStocks === "object") {
        // Try exact match first
        availableStock = sizeStocks[item.size] ?? 0;
        // Try case-insensitive match
        if (availableStock === 0) {
          const sizeKey = Object.keys(sizeStocks).find(
            (k) => k.toLowerCase() === item.size?.toLowerCase(),
          );
          if (sizeKey) availableStock = sizeStocks[sizeKey] ?? 0;
        }
      }
    }

    // Final fallback to product stock_quantity (if no size-based stock)
    if (availableStock === 0 && !item.size) {
      availableStock = product.stock_quantity || 0;
    }

    console.log(
      `📦 Stock check for "${item.name}" (size: ${item.size}, color: ${item.color}): ${availableStock} available, ${item.quantity} requested`,
    );

    // Check if sufficient stock
    if (availableStock < item.quantity) {
      insufficient.push({
        name: item.name,
        requested: item.quantity,
        available: Math.max(0, availableStock),
        size: item.size,
        color: item.color,
      });
    }
  }

  return {
    valid: insufficient.length === 0,
    insufficient: insufficient.length > 0 ? insufficient : undefined,
  };
}

// POST - Create a new order from public store (no auth required)
export async function POST(
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
      skip_stock_check = false, // Allow bypassing for special cases
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

    // ── RESOLVE SLUG → USER_ID ────────────────────────────────────────
    // The URL slug (username) may be "a1b2c3d4" or "rajas-boutique".
    // Resolve to the actual Firebase UID for backend calls.
    const resolvedUserId = await resolveSlugToUserId(username);
    const storeOwnerId = resolvedUserId || username;

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

    // =========================================================================
    // CRITICAL FIX: Route through Flask backend for proper inventory management
    // The Flask backend handles: reserve → create order → confirm (deduct stock)
    // =========================================================================
    const BACKEND_URL =
      process.env.NODE_ENV === "development"
        ? "http://localhost:5000"
        : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    const flaskOrderData = {
      user_id: storeOwnerId,
      customer_name,
      customer_phone,
      customer_address,
      customer_email, // FIX: Include email in Flask payload
      items: items.map((item: OrderItem) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        product_id: item.product_id,
        variant_id: item.variant_id,
        size: item.size,
        color: item.color,
        notes: item.notes,
      })),
      source,
      notes,
    };

    console.log(
      `📦 Store Orders API: Routing order to Flask backend for store ${username}`,
    );

    // Call Flask backend - this handles full inventory flow
    const backendResponse = await fetch(`${BACKEND_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": storeOwnerId,
      },
      body: JSON.stringify(flaskOrderData),
    });

    const backendResult = await backendResponse.json();

    // Handle insufficient stock error from Flask backend
    if (!backendResponse.ok) {
      // Check for stock validation errors
      if (
        backendResult.error?.code === "INSUFFICIENT_STOCK" ||
        backendResult.error?.message?.includes("stock") ||
        backendResult.error?.message?.includes("available")
      ) {
        console.log(
          `⚠️ Stock validation failed for store ${username}:`,
          backendResult.error,
        );
        return NextResponse.json(
          {
            success: false,
            error: backendResult.error?.message || "Insufficient stock",
            insufficient_items: backendResult.error?.insufficient_items || [],
          },
          { status: 422 },
        );
      }

      // Handle other errors
      console.error("Flask backend error:", backendResult);
      return NextResponse.json(
        {
          success: false,
          error: backendResult.error?.message || "Failed to create order",
        },
        { status: backendResponse.status },
      );
    }

    // Extract order data from Flask response
    const orderData = backendResult.data;

    if (!orderData || !orderData.id) {
      console.error("Flask backend returned no order data:", backendResult);
      return NextResponse.json(
        { error: "Failed to create order - no order ID returned" },
        { status: 500 },
      );
    }

    console.log(
      `✅ Store Orders API: Order ${orderData.id} created with stock deducted for store ${username}`,
    );

    // ------------------------------------------------------------------
    // AUTO-SEND INVOICE EMAIL
    // Migrated fully to Celery background task on the Python Backend.
    // ------------------------------------------------------------------

    // ------------------------------------------------------------------
    // GOOGLE SHEETS SYNC (Non-blocking, fire-and-forget)
    // ------------------------------------------------------------------
    // Fire-and-forget: trigger Google Sheets sync via Flask backend.
    // Any failures here should NOT impact order creation for the customer.
    try {
      const BACKEND_URL =
        process.env.NODE_ENV === "development"
          ? "http://localhost:5000"
          : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

      // Only attempt sync if we have an order id and user id.
      if (orderData?.id && storeOwnerId) {
        // Do not await this fetch; log errors but keep response fast.
        fetch(`${BACKEND_URL}/api/orders/sheets/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": storeOwnerId,
          },
          body: JSON.stringify({
            order_id: orderData.id,
            user_id: storeOwnerId,
          }),
        }).catch((err) => {
          console.error("Error triggering Google Sheets sync:", err);
        });
      }
    } catch (err) {
      console.error("Error preparing Google Sheets sync:", err);
    }

    // Return immediately - don't wait for email or sheets sync
    return NextResponse.json(
      {
        success: true,
        data: orderData,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in POST /api/store/[username]/orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
