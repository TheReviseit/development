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

    // Generate unique ID and order_id with consistent format
    // Format: order_id = First 8 chars of UUID, UPPERCASE (e.g., "28C2CF22")
    // This matches the backend Python format and DB trigger format
    const orderId = randomUUID();
    const shortOrderId = generateOrderId(orderId);

    // Create order with pre-generated IDs
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        order_id: shortOrderId,
        user_id: storeSlug, // storeSlug is the user_id
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

    if (orderError) {
      console.error("Error creating order:", orderError);
      return NextResponse.json(
        { error: "Failed to create order" },
        { status: 500 },
      );
    }

    console.log(
      `📦 Store Orders API: Created order ${orderData.id} for store ${storeSlug}`,
    );

    // ------------------------------------------------------------------
    // AUTO-SEND INVOICE EMAIL (Non-blocking, fire-and-forget)
    // ------------------------------------------------------------------
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
