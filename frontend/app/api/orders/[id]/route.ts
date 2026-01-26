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
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

// GET - Get single order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
        { status: 500 }
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
      { status: 500 }
    );
  }
}

// PUT - Update order
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    // First verify ownership
    const { data: existing, error: checkError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (checkError || !existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (customer_name !== undefined) updateData.customer_name = customer_name;
    if (customer_phone !== undefined)
      updateData.customer_phone = customer_phone;
    if (notes !== undefined) updateData.notes = notes;
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
      }
    }
    if (items !== undefined && Array.isArray(items) && items.length > 0) {
      updateData.items = items;
      updateData.total_quantity = items.reduce(
        (sum: number, item: { quantity: number }) => sum + (item.quantity || 0),
        0
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
        { status: 500 }
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

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in PUT /api/orders/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE - Cancel/delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabase();

    // Soft delete by setting status to cancelled
    const { data, error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      console.error("Error cancelling order:", error);
      return NextResponse.json(
        { error: "Failed to cancel order" },
        { status: 500 }
      );
    }

    // Best-effort: reflect cancellations in Google Sheets as well.
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
          console.error(
            "Error triggering Google Sheets sync on cancel:",
            err,
          );
        });
      }
    } catch (err) {
      console.error("Error preparing Google Sheets sync on cancel:", err);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in DELETE /api/orders/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
