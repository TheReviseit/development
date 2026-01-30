import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { InvoiceDocument } from "@/lib/invoice-pdf";
import { renderToBuffer } from "@react-pdf/renderer";
import { randomUUID } from "crypto";
import { generateOrderId } from "@/lib/order-id";

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

// Validate stock availability for all items
// Based on schema:
// - Products have size_stocks JSONB like {"XXL": 2, "Free Size": 2}
// - Product variants have size_stocks JSONB like {"L": 30, "M": 30}
// - products.stock_quantity is often 0 when size_stocks is used
async function validateStockForOrder(
  supabase: ReturnType<typeof getSupabase>,
  storeSlug: string,
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
        .eq("user_id", storeSlug)
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
        .eq("user_id", storeSlug)
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

    // Prepare order data for Flask backend
    const flaskOrderData = {
      user_id: storeSlug,
      customer_name,
      customer_phone,
      customer_address,
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
      `📦 Store Orders API: Routing order to Flask backend for store ${storeSlug}`,
    );

    // Call Flask backend - this handles full inventory flow
    const backendResponse = await fetch(`${BACKEND_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": storeSlug,
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
          `⚠️ Stock validation failed for store ${storeSlug}:`,
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
      `✅ Store Orders API: Order ${orderData.id} created with stock deducted for store ${storeSlug}`,
    );

    // ------------------------------------------------------------------
    // AUTO-SEND INVOICE EMAIL (Non-blocking, fire-and-forget)
    // Need supabase client for business details and email tracking
    // ------------------------------------------------------------------
    const supabase = getSupabase();

    if (customer_email) {
      // Fire-and-forget: Don't await this - it runs in background
      (async () => {
        try {
          // Fetch business details for invoice branding
          const { data: businessData, error: businessError } = await supabase
            .from("businesses")
            .select("business_name, logo_url, contact, location, brand_color")
            .eq("user_id", storeSlug)
            .single();

          if (businessData && !businessError) {
            const invoiceNumber = `INV-${orderData.id.slice(0, 8).toUpperCase()}`;
            const subtotal = items.reduce(
              (sum: number, item: OrderItem) =>
                sum + (item.price || 0) * item.quantity,
              0,
            );
            const shipping = 0;
            const total = subtotal + shipping;

            const isPaid =
              source === "api" ||
              notes?.includes("Payment ID") ||
              status === "paid" ||
              status === "completed";
            const paymentStatus = isPaid ? "paid" : "cod";

            // Parse JSON fields if they come as strings
            const contact =
              typeof businessData.contact === "string"
                ? JSON.parse(businessData.contact)
                : businessData.contact || {};
            const location =
              typeof businessData.location === "string"
                ? JSON.parse(businessData.location)
                : businessData.location || {};

            const invoiceData = {
              invoiceNumber,
              orderId: orderData.id,
              date: new Date().toISOString(),
              customer: {
                name: customer_name,
                phone: customer_phone,
                email: customer_email,
                address: customer_address || "",
              },
              items: items.map((item: OrderItem) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price || 0,
                imageUrl: item.imageUrl,
                size: item.size,
                color: item.color,
              })),
              subtotal,
              shipping,
              total,
              paymentStatus: paymentStatus as "paid" | "cod",
            };

            const businessName = businessData.business_name || "Store";
            const businessInfo = {
              name: businessName,
              logoUrl: businessData.logo_url,
              brandColor: businessData.brand_color,
              phone: contact.phone || "",
              address: [
                location.address,
                location.city,
                location.state,
                location.pincode,
              ]
                .filter(Boolean)
                .join(", "),
              storeSlug: storeSlug,
            };

            // Generate PDF
            const pdfBuffer = await renderToBuffer(
              React.createElement(InvoiceDocument, {
                invoice: invoiceData,
                business: businessInfo,
              }) as any,
            );

            console.log(`📧 Auto-sending invoice PDF to ${customer_email}`);

            // Professional email body
            const emailBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1a1a1a; margin-bottom: 20px;">Thank you for your order!</h2>
                <p style="color: #666; font-size: 15px; line-height: 1.6;">
                  Hi ${customer_name},
                </p>
                <p style="color: #666; font-size: 15px; line-height: 1.6;">
                  Your order has been successfully placed with <strong>${businessName}</strong>. 
                  Please find your invoice attached to this email as a PDF document.
                </p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; color: #333;"><strong>Order ID:</strong> ${orderData.id}</p>
                  <p style="margin: 8px 0 0; color: #333;"><strong>Invoice:</strong> ${invoiceNumber}</p>
                  <p style="margin: 8px 0 0; color: #333;"><strong>Total:</strong> ₹${total}</p>
                </div>
                <p style="color: #666; font-size: 15px; line-height: 1.6;">
                  If you have any questions about your order, please don't hesitate to contact us.
                </p>
                <p style="color: #888; font-size: 13px; margin-top: 30px;">
                  — The ${businessName} Team
                </p>
              </div>
            `;

            const emailResult = await sendEmail({
              to: customer_email,
              subject: `Your Order Receipt - ${invoiceNumber}`,
              html: emailBody,
              attachments: [
                {
                  filename: `${invoiceNumber}.pdf`,
                  content: pdfBuffer,
                },
              ],
            });

            if (emailResult.success) {
              await supabase
                .from("orders")
                .update({
                  invoice_sent_at: new Date().toISOString(),
                  invoice_email: customer_email,
                })
                .eq("id", orderData.id);
              console.log(`✅ Invoice auto-sent for order ${orderData.id}`);
            } else {
              console.error(
                `❌ Failed to auto-send invoice: ${emailResult.error}`,
              );
            }
          }
        } catch (emailError) {
          console.error(
            "Error in auto-send invoice logic (background):",
            emailError,
          );
        }
      })();
    }

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
      if (orderData?.id && storeSlug) {
        // Do not await this fetch; log errors but keep response fast.
        fetch(`${BACKEND_URL}/api/orders/sheets/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": storeSlug,
          },
          body: JSON.stringify({
            order_id: orderData.id,
            user_id: storeSlug,
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
    console.error("Error in POST /api/store/[storeSlug]/orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
