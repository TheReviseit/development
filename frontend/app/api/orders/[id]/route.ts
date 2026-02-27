import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { adminAuth, verifySessionCookieSafe } from "@/lib/firebase-admin";
import {
  triggerOrderStatusNotification,
  OrderStatus,
  OrderDetails,
  BusinessDetails,
} from "@/lib/notifications/order-status-notifications";

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

// Helper to get user ID from Firebase session cookie
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      console.log("[orders/id] No session cookie found");
      return null;
    }

    const result = await verifySessionCookieSafe(sessionCookie, false);

    if (!result.success || !result.data) {
      console.error(
        "[orders/id] Session verification failed:",
        result.error,
        result.errorCode,
      );
      return null;
    }

    return result.data.uid;
  } catch (error) {
    console.error("[orders/id] Unexpected error in getUserId:", error);
    return null;
  }
}

// GET - Get single order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      console.error("Error fetching order:", error);
      return NextResponse.json(
        { error: "Failed to fetch order" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in GET /api/orders/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { customer_name, customer_phone, items, status, notes } = body;

    const supabase = getSupabase();

    // Fetch full order details including previous status for notification logic
    const { data: existingOrder, error: checkError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (checkError || !existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Store previous status for notification comparison
    const previousStatus = existingOrder.status as OrderStatus;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (customer_phone !== undefined)
      updateData.customer_phone = customer_phone;
    if (notes !== undefined) updateData.notes = notes;

    let newStatus: OrderStatus | undefined;
    if (status !== undefined) {
      const validStatuses = [
        "pending",
        "confirmed",
        "processing",
        "completed",
        "cancelled",
      ];
      if (validStatuses.includes(status)) {
        updateData.status = status;
        newStatus = status as OrderStatus;
      }
    }
    if (items !== undefined && Array.isArray(items) && items.length > 0) {
      updateData.items = items;
      updateData.total_quantity = items.reduce(
        (sum: number, item: { quantity: number }) => sum + (item.quantity || 0),
        0,
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating order:", error);
      return NextResponse.json(
        { error: "Failed to update order" },
        { status: 500 },
      );
    }

    // Best-effort: keep Google Sheet in sync when orders are updated.
    try {
      if (data?.id && userId) {
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
          console.error("Error triggering Google Sheets sync on update:", err);
        });
      }
    } catch (err) {
      console.error("Error preparing Google Sheets sync on update:", err);
    }

    // =======================================================================
    // ORDER STATUS NOTIFICATION (Fire-and-forget)
    // Send email/WhatsApp notification when status changes
    // Backend handles WhatsApp credential lookup using user_id (multi-tenant)
    // =======================================================================
    if (newStatus && newStatus !== previousStatus) {
      // ── Feature gate: live_order_updates (metered per plan) ───────────────
      // Check usage against hard_limit and atomically increment if allowed.
      // Fail-open: if gate check fails, still send notifications.
      let canSendNotifications = true;
      try {
        // Resolve Firebase UID → Supabase UUID
        const { data: userRow } = await supabase
          .from("users")
          .select("id")
          .eq("firebase_uid", userId)
          .limit(1)
          .maybeSingle();

        if (userRow?.id) {
          // Get active subscription for shop domain
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("pricing_plan_id")
            .eq("user_id", userRow.id)
            .eq("product_domain", "shop")
            .in("status", [
              "active",
              "completed",
              "past_due",
              "trialing",
              "trial",
            ])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (sub?.pricing_plan_id) {
            // Check if plan has live_order_updates feature
            let featureData: {
              hard_limit: number | null;
              soft_limit: number | null;
              is_unlimited: boolean;
            } | null = null;

            const { data: planFeature } = await supabase
              .from("plan_features")
              .select("hard_limit, soft_limit, is_unlimited")
              .eq("plan_id", sub.pricing_plan_id)
              .eq("feature_key", "live_order_updates")
              .limit(1)
              .maybeSingle();

            if (planFeature) {
              featureData = planFeature;
            } else {
              // Feature not in plan — check sibling plans (same slug, different billing period)
              const { data: plan } = await supabase
                .from("pricing_plans")
                .select("plan_slug")
                .eq("id", sub.pricing_plan_id)
                .limit(1)
                .maybeSingle();

              if (plan?.plan_slug) {
                const { data: siblingPlan } = await supabase
                  .from("pricing_plans")
                  .select("id")
                  .eq("plan_slug", plan.plan_slug)
                  .eq("product_domain", "shop")
                  .eq("is_active", true)
                  .neq("id", sub.pricing_plan_id)
                  .limit(1)
                  .maybeSingle();

                if (siblingPlan) {
                  const { data: sibFeature } = await supabase
                    .from("plan_features")
                    .select("hard_limit, soft_limit, is_unlimited")
                    .eq("plan_id", siblingPlan.id)
                    .eq("feature_key", "live_order_updates")
                    .limit(1)
                    .maybeSingle();
                  if (sibFeature) {
                    featureData = sibFeature;
                  }
                }
              }
            }

            if (!featureData) {
              // Feature not found in plan or siblings → deny
              canSendNotifications = false;
              console.log(
                `⏭️ [Notification] Skipping - live_order_updates not in plan for user ${userId.slice(0, 15)}...`,
              );
            } else if (featureData.is_unlimited) {
              // Unlimited — always allowed
              canSendNotifications = true;
            } else if (
              featureData.hard_limit !== null &&
              featureData.hard_limit <= 0
            ) {
              // Explicitly denied (hard_limit = 0)
              canSendNotifications = false;
              console.log(
                `⏭️ [Notification] Skipping - live_order_updates denied (hard_limit=0) for user ${userId.slice(0, 15)}...`,
              );
            } else if (featureData.hard_limit !== null) {
              // Metered — check usage and atomically increment
              const { data: rpcResult } = await supabase.rpc(
                "check_and_increment_usage",
                {
                  p_user_id: userRow.id,
                  p_domain: "shop",
                  p_feature_key: "live_order_updates",
                  p_hard_limit: featureData.hard_limit,
                  p_soft_limit:
                    featureData.soft_limit ??
                    Math.floor(featureData.hard_limit * 0.8),
                  p_is_unlimited: false,
                  p_idempotency_key: `notif-${data.id}-${newStatus}`,
                },
              );

              if (rpcResult && !rpcResult.allowed) {
                canSendNotifications = false;
                console.log(
                  `⏭️ [Notification] Skipping - live_order_updates limit reached (${rpcResult.new_value}/${featureData.hard_limit}) for user ${userId.slice(0, 15)}...`,
                );
              }
            }
            // hard_limit === null and not unlimited → boolean granted, allow
          } else {
            // No subscription → skip notifications
            canSendNotifications = false;
            console.log(
              `⏭️ [Notification] Skipping - no active subscription for user ${userId.slice(0, 15)}...`,
            );
          }
        }
      } catch (gateErr) {
        // Fail-open: if gate check fails, still send notifications
        console.warn(
          `⚠️ [Notification] Feature gate check failed, proceeding:`,
          gateErr,
        );
      }

      if (canSendNotifications) {
        try {
          // Fetch business details for branded notifications
          const { data: businessData } = await supabase
            .from("businesses")
            .select("business_name, logo_url")
            .eq("user_id", userId)
            .single();

          const orderDetails: OrderDetails = {
            id: data.id,
            order_id: data.order_id,
            customer_name: data.customer_name,
            customer_phone: data.customer_phone,
            customer_email: data.customer_email,
            items: data.items,
            total_quantity: data.total_quantity,
          };

          // BusinessDetails - WhatsApp credentials are looked up by the backend
          // using user_id (Firebase UID), so we don't need to fetch them here
          const businessDetails: BusinessDetails = {
            user_id: userId, // Firebase UID - backend uses this to fetch WhatsApp creds
            business_name: businessData?.business_name || "Store",
            logo_url: businessData?.logo_url,
            // whatsapp_phone_number_id and whatsapp_access_token are NOT needed
            // Backend's /api/whatsapp/send-notification handles credential lookup
          };

          // Fire-and-forget: Don't await - notification runs in background
          triggerOrderStatusNotification(
            orderDetails,
            newStatus,
            previousStatus,
            businessDetails,
          );

          console.log(
            `🔔 Order status notification triggered for #${data.order_id || data.id.slice(0, 8)}: ${previousStatus} → ${newStatus}`,
          );
        } catch (notifError) {
          // Never fail the request due to notification errors
          console.error("Error preparing order notification:", notifError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in PUT /api/orders/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE - Cancel/delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabase();

    // First, delete related inventory_audit_log rows (foreign key constraint)
    const { error: auditError } = await supabase
      .from("inventory_audit_log")
      .delete()
      .eq("order_id", id);

    if (auditError) {
      console.warn("Warning deleting audit log entries:", auditError);
      // Continue anyway — the audit log FK may not exist for all orders
    }

    // Hard delete - completely remove the order from the database
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      console.error("Error deleting order:", error);
      return NextResponse.json(
        { error: "Failed to delete order" },
        { status: 500 },
      );
    }

    // Best-effort: reflect deletions in Google Sheets as well.
    try {
      if (userId) {
        fetch(`${BACKEND_URL}/api/orders/sheets/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": userId,
          },
          body: JSON.stringify({
            order_id: id,
            user_id: userId,
            deleted: true,
          }),
        }).catch((err) => {
          console.error("Error triggering Google Sheets sync on delete:", err);
        });
      }
    } catch (err) {
      console.error("Error preparing Google Sheets sync on delete:", err);
    }

    return NextResponse.json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/orders/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
