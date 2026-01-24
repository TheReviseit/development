import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// Initialize Supabase with service role
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/products/[id]/restore - Restore a soft-deleted product
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = result.data!.uid;

    const { id } = await context.params;
    const supabase = getSupabase();

    // First verify ownership and that product is deleted
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("id, name, user_id, is_deleted")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!existing.is_deleted) {
      return NextResponse.json(
        { error: "Product is not deleted" },
        { status: 400 },
      );
    }

    // Restore product
    const { error: restoreError } = await supabase
      .from("products")
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (restoreError) {
      console.error("Error restoring product:", restoreError);
      return NextResponse.json(
        { error: restoreError.message },
        { status: 500 },
      );
    }

    // Log audit
    try {
      await supabase.from("product_audit_log").insert({
        user_id: userId,
        product_id: id,
        action: "restore",
        changes: { name: existing.name },
        affected_count: 1,
      });
    } catch (e) {
      console.error("Audit log failed:", e);
    }

    console.log(`♻️ Restored product "${existing.name}" for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: "Product restored successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/products/[id]/restore:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
