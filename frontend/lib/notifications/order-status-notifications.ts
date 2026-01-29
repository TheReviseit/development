/**
 * Order Status Notification Service
 *
 * Enterprise-grade notification system for order status updates.
 * Supports Email (via Resend) and WhatsApp (via Flask backend).
 *
 * Features:
 * - Intelligent fallback: Email first, WhatsApp if no email
 * - Professional branded message templates
 * - Non-blocking async execution
 * - Comprehensive error handling and logging
 * - Idempotency support
 */

import { sendEmail } from "@/lib/email/resend";

// Backend Flask API for WhatsApp
const BACKEND_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// =============================================================================
// Types
// =============================================================================

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "completed"
  | "cancelled";

export interface OrderDetails {
  id: string;
  order_id?: string; // Short order ID like "28C2CF22"
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  items?: Array<{
    name: string;
    quantity: number;
    price?: number;
  }>;
  total_quantity?: number;
  notes?: string;
}

export interface BusinessDetails {
  user_id: string;
  business_name: string;
  whatsapp_phone_number_id?: string;
  whatsapp_access_token?: string;
  logo_url?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: "email" | "whatsapp" | "none";
  messageId?: string;
  error?: string;
}

// =============================================================================
// Status Message Templates
// =============================================================================

interface StatusMessages {
  emoji: string;
  title: string;
  description: string;
  emailSubject: string;
}

const STATUS_MESSAGES: Record<OrderStatus, StatusMessages> = {
  pending: {
    emoji: "🕐",
    title: "Order Received",
    description: "Your order has been received and is awaiting confirmation.",
    emailSubject: "Order Received",
  },
  confirmed: {
    emoji: "✅",
    title: "Order Confirmed",
    description:
      "Great news! Your order has been confirmed and is being prepared.",
    emailSubject: "Order Confirmed",
  },
  processing: {
    emoji: "📦",
    title: "Order Processing",
    description: "Your order is being packed and will be dispatched soon.",
    emailSubject: "Order Being Processed",
  },
  completed: {
    emoji: "🎉",
    title: "Order Completed",
    description:
      "Your order has been successfully delivered. Thank you for shopping with us!",
    emailSubject: "Order Delivered",
  },
  cancelled: {
    emoji: "❌",
    title: "Order Cancelled",
    description:
      "Your order has been cancelled. If you have any questions, please contact us.",
    emailSubject: "Order Cancelled",
  },
};

// =============================================================================
// Email Notification
// =============================================================================

function generateEmailHtml(
  order: OrderDetails,
  status: OrderStatus,
  business: BusinessDetails,
): string {
  const statusInfo = STATUS_MESSAGES[status];
  const shortOrderId = order.order_id || order.id.slice(0, 8).toUpperCase();

  // Status-specific colors
  const statusColors: Record<OrderStatus, string> = {
    pending: "#f59e0b", // Amber
    confirmed: "#22c55e", // Green
    processing: "#3b82f6", // Blue
    completed: "#10b981", // Emerald
    cancelled: "#ef4444", // Red
  };

  const statusColor = statusColors[status];

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <tr>
          <td style="padding: 32px 24px; text-align: center; background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%);">
            ${
              business.logo_url
                ? `<img src="${business.logo_url}" alt="${business.business_name}" style="max-height: 48px; margin-bottom: 12px;" />`
                : ""
            }
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
              ${business.business_name}
            </h1>
          </td>
        </tr>
        
        <!-- Status Badge -->
        <tr>
          <td style="padding: 32px 24px 16px;">
            <div style="text-align: center;">
              <span style="display: inline-block; padding: 12px 24px; background-color: ${statusColor}; color: #ffffff; font-size: 18px; font-weight: 600; border-radius: 50px;">
                ${statusInfo.emoji} ${statusInfo.title}
              </span>
            </div>
          </td>
        </tr>
        
        <!-- Greeting -->
        <tr>
          <td style="padding: 16px 24px;">
            <p style="margin: 0; color: #1a1a1a; font-size: 16px; line-height: 1.6;">
              Hi <strong>${order.customer_name}</strong>,
            </p>
            <p style="margin: 12px 0 0; color: #666666; font-size: 15px; line-height: 1.6;">
              ${statusInfo.description}
            </p>
          </td>
        </tr>
        
        <!-- Order Details Card -->
        <tr>
          <td style="padding: 16px 24px;">
            <div style="background-color: #f8f9fa; border-radius: 12px; padding: 20px; border: 1px solid #e9ecef;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-bottom: 12px; border-bottom: 1px solid #e9ecef;">
                    <span style="color: #888888; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Order ID</span>
                    <p style="margin: 4px 0 0; color: #1a1a1a; font-size: 18px; font-weight: 700; font-family: monospace;">
                      #${shortOrderId}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 12px;">
                    <span style="color: #888888; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                    <p style="margin: 4px 0 0; color: ${statusColor}; font-size: 16px; font-weight: 600;">
                      ${status.charAt(0).toUpperCase() + status.slice(1)}
                    </p>
                  </td>
                </tr>
                ${
                  order.total_quantity
                    ? `
                <tr>
                  <td style="padding-top: 12px;">
                    <span style="color: #888888; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Items</span>
                    <p style="margin: 4px 0 0; color: #1a1a1a; font-size: 16px;">
                      ${order.total_quantity} item${order.total_quantity > 1 ? "s" : ""}
                    </p>
                  </td>
                </tr>
                `
                    : ""
                }
              </table>
            </div>
          </td>
        </tr>
        
        <!-- Footer -->
        <tr>
          <td style="padding: 24px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.6;">
              If you have any questions, please reply to this email or contact us.
            </p>
            <p style="margin: 12px 0 0; color: #aaaaaa; font-size: 12px;">
              © ${new Date().getFullYear()} ${business.business_name}. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendEmailNotification(
  order: OrderDetails,
  status: OrderStatus,
  business: BusinessDetails,
): Promise<NotificationResult> {
  if (!order.customer_email) {
    return { success: false, channel: "none", error: "No email address" };
  }

  const statusInfo = STATUS_MESSAGES[status];
  const shortOrderId = order.order_id || order.id.slice(0, 8).toUpperCase();

  try {
    console.log(
      `📧 [Notification] Sending email for order #${shortOrderId} status: ${status}`,
    );

    const emailResult = await sendEmail({
      to: order.customer_email,
      subject: `${statusInfo.emoji} ${statusInfo.emailSubject} - Order #${shortOrderId}`,
      html: generateEmailHtml(order, status, business),
      from: `${business.business_name} <orders@flowauxi.com>`,
    });

    if (emailResult.success) {
      console.log(
        `✅ [Notification] Email sent successfully for order #${shortOrderId}`,
      );
      return {
        success: true,
        channel: "email",
        messageId: emailResult.messageId,
      };
    } else {
      console.error(
        `❌ [Notification] Email failed for order #${shortOrderId}:`,
        emailResult.error,
      );
      return {
        success: false,
        channel: "email",
        error: emailResult.error,
      };
    }
  } catch (error: any) {
    console.error(
      `❌ [Notification] Email error for order #${shortOrderId}:`,
      error,
    );
    return {
      success: false,
      channel: "email",
      error: error.message || "Failed to send email",
    };
  }
}

// =============================================================================
// WhatsApp Notification
// =============================================================================

function generateWhatsAppMessage(
  order: OrderDetails,
  status: OrderStatus,
  business: BusinessDetails,
): string {
  const statusInfo = STATUS_MESSAGES[status];
  const shortOrderId = order.order_id || order.id.slice(0, 8).toUpperCase();

  return `
${statusInfo.emoji} *${statusInfo.title}*

Hi ${order.customer_name},

${statusInfo.description}

📦 *Order ID:* #${shortOrderId}
📊 *Status:* ${status.charAt(0).toUpperCase() + status.slice(1)}
${order.total_quantity ? `🛒 *Items:* ${order.total_quantity} item${order.total_quantity > 1 ? "s" : ""}` : ""}

Thank you for choosing *${business.business_name}*!
`.trim();
}

async function sendWhatsAppNotification(
  order: OrderDetails,
  status: OrderStatus,
  business: BusinessDetails,
): Promise<NotificationResult> {
  if (!order.customer_phone) {
    return { success: false, channel: "none", error: "No phone number" };
  }

  // Note: WhatsApp credentials are now looked up by the backend using user_id
  // No need to pass credentials from frontend - this is the proper multi-tenant approach

  const shortOrderId = order.order_id || order.id.slice(0, 8).toUpperCase();

  try {
    console.log(
      `📱 [Notification] Sending WhatsApp for order #${shortOrderId} status: ${status}`,
    );

    // Normalize phone number (remove + if present)
    const phoneNumber = order.customer_phone.replace(/^\+/, "");

    // Use the new notification endpoint that handles credential lookup on the backend
    // This ensures tokens are never exposed to the frontend and are auto-decrypted
    const response = await fetch(
      `${BACKEND_URL}/api/whatsapp/send-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: business.user_id, // Firebase UID - backend will fetch credentials
          to: phoneNumber,
          message: generateWhatsAppMessage(order, status, business),
        }),
      },
    );

    const data = await response.json();

    if (data.success) {
      console.log(
        `✅ [Notification] WhatsApp sent successfully for order #${shortOrderId}`,
      );
      return {
        success: true,
        channel: "whatsapp",
        messageId: data.message_id,
      };
    } else {
      // Check if WhatsApp is not configured
      if (
        data.error?.includes("not configured") ||
        data.error?.includes("not found")
      ) {
        console.log(
          `⚠️ [Notification] WhatsApp not configured for business ${business.business_name}`,
        );
        return {
          success: false,
          channel: "none",
          error: "WhatsApp not configured",
        };
      }
      console.error(
        `❌ [Notification] WhatsApp failed for order #${shortOrderId}:`,
        data.error,
      );
      return {
        success: false,
        channel: "whatsapp",
        error: data.error || "Failed to send WhatsApp message",
      };
    }
  } catch (error: any) {
    console.error(
      `❌ [Notification] WhatsApp error for order #${shortOrderId}:`,
      error,
    );
    return {
      success: false,
      channel: "whatsapp",
      error: error.message || "Failed to send WhatsApp message",
    };
  }
}

// =============================================================================
// Main Notification Function
// =============================================================================

/**
 * Send order status notification to customer.
 *
 * Priority: Email (if available) → WhatsApp (fallback)
 *
 * This function is designed to be fire-and-forget - it handles all errors
 * internally and never throws. Safe to call without await.
 *
 * @param order - Order details
 * @param newStatus - The new status being set
 * @param previousStatus - The previous status (used to avoid duplicate notifications)
 * @param business - Business details including WhatsApp credentials
 * @returns Promise<NotificationResult>
 */
export async function sendOrderStatusNotification(
  order: OrderDetails,
  newStatus: OrderStatus,
  previousStatus: OrderStatus | null,
  business: BusinessDetails,
): Promise<NotificationResult> {
  const shortOrderId = order.order_id || order.id.slice(0, 8).toUpperCase();

  // Skip if status hasn't actually changed
  if (previousStatus === newStatus) {
    console.log(
      `⏭️ [Notification] Skipping - status unchanged for order #${shortOrderId}`,
    );
    return { success: true, channel: "none" };
  }

  // Skip notifications for "pending" status (initial state)
  if (newStatus === "pending") {
    console.log(
      `⏭️ [Notification] Skipping - pending status for order #${shortOrderId}`,
    );
    return { success: true, channel: "none" };
  }

  console.log(
    `🔔 [Notification] Processing status change for order #${shortOrderId}: ${previousStatus} → ${newStatus}`,
  );

  try {
    // Strategy: Send to BOTH email AND WhatsApp if available
    // - Always send WhatsApp if phone number exists
    // - Also send email if email address exists
    const results: NotificationResult[] = [];
    let whatsappResult: NotificationResult | null = null;
    let emailResult: NotificationResult | null = null;

    // Send WhatsApp notification (primary channel - always send if phone exists)
    if (order.customer_phone) {
      console.log(
        `📱 [Notification] Sending WhatsApp to ${order.customer_phone} for order #${shortOrderId}`,
      );
      whatsappResult = await sendWhatsAppNotification(
        order,
        newStatus,
        business,
      );
      results.push(whatsappResult);
    }

    // Send email notification (secondary channel - send if email exists)
    if (order.customer_email) {
      console.log(
        `📧 [Notification] Sending email to ${order.customer_email} for order #${shortOrderId}`,
      );
      emailResult = await sendEmailNotification(order, newStatus, business);
      results.push(emailResult);
    }

    // No contact methods available
    if (results.length === 0) {
      console.warn(
        `⚠️ [Notification] No contact method available for order #${shortOrderId}`,
      );
      return {
        success: false,
        channel: "none",
        error: "No contact method available",
      };
    }

    // Log results
    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;
    console.log(
      `📊 [Notification] Results for order #${shortOrderId}: ${successCount}/${totalCount} channels succeeded`,
    );

    // Return combined result
    // Success if at least one channel succeeded
    if (successCount > 0) {
      const channels: string[] = [];
      if (whatsappResult?.success) channels.push("whatsapp");
      if (emailResult?.success) channels.push("email");

      return {
        success: true,
        channel: channels.join("+") as "whatsapp" | "email" | "none",
        messageId: whatsappResult?.messageId || emailResult?.messageId,
      };
    }

    // Both failed
    return {
      success: false,
      channel: "none",
      error: `All channels failed: WhatsApp: ${whatsappResult?.error || "N/A"}, Email: ${emailResult?.error || "N/A"}`,
    };
  } catch (error: any) {
    console.error(
      `❌ [Notification] Unexpected error for order #${shortOrderId}:`,
      error,
    );
    return {
      success: false,
      channel: "none",
      error: error.message || "Unexpected error",
    };
  }
}

/**
 * Fire-and-forget wrapper for sendOrderStatusNotification.
 * Use this when you don't need to wait for the result.
 */
export function triggerOrderStatusNotification(
  order: OrderDetails,
  newStatus: OrderStatus,
  previousStatus: OrderStatus | null,
  business: BusinessDetails,
): void {
  sendOrderStatusNotification(order, newStatus, previousStatus, business)
    .then((result) => {
      if (result.success) {
        console.log(
          `✅ [Notification] Sent via ${result.channel} for order #${order.order_id || order.id.slice(0, 8)}`,
        );
      } else if (result.channel !== "none") {
        console.log(
          `⚠️ [Notification] Failed via ${result.channel}: ${result.error}`,
        );
      }
    })
    .catch((error) => {
      console.error(`❌ [Notification] Unexpected error:`, error);
    });
}
