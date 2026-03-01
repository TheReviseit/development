import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { deleteProductImage } from "@/lib/cloudinary";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function verifyUser(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await verifySessionCookieSafe(sessionCookie, true);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  return { userId: result.data!.uid };
}

interface RouteContext {
  params: Promise<{ id: string; variantId: string }>;
}

// DELETE /api/products/[id]/variants/[variantId]
// Permanently deletes a single variant from the DB and its image from Cloudinary.
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id: productId, variantId } = await context.params;
    const supabase = getSupabase();

    // Verify the parent product belongs to this user
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, user_id")
      .eq("id", productId)
      .eq("user_id", userId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Fetch the variant — must belong to this product and user
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .select("id, image_public_id, color, size")
      .eq("id", variantId)
      .eq("product_id", productId)
      .eq("user_id", userId)
      .single();

    if (variantError || !variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    // Delete from DB first — fail fast before touching Cloudinary
    const { error: deleteError } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", variantId)
      .eq("product_id", productId)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Error deleting variant:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Delete variant image from Cloudinary (best-effort, non-blocking to response)
    if (variant.image_public_id) {
      try {
        const cloudResult = await deleteProductImage(variant.image_public_id);
        if (!cloudResult.success) {
          // Log but do NOT fail — DB row is already gone, image cleanup is secondary
          console.warn(
            `Cloudinary cleanup incomplete for public_id "${variant.image_public_id}":`,
            cloudResult.error,
          );
        } else {
          console.log(
            `🖼️  Deleted Cloudinary image "${variant.image_public_id}" for variant ${variantId}`,
          );
        }
      } catch (cloudError) {
        console.error("Cloudinary deletion threw (non-critical):", cloudError);
      }
    }

    // Decrement usage counter by 1 (one variant removed)
    try {
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("firebase_uid", userId)
        .limit(1)
        .single();

      if (userRow) {
        const { data: counterRow } = await supabase
          .from("usage_counters")
          .select("current_value")
          .match({
            user_id: userRow.id,
            feature_key: "create_product",
            domain: "shop",
          })
          .limit(1)
          .single();

        if (counterRow) {
          const newValue = Math.max(0, (counterRow.current_value ?? 0) - 1);
          await supabase
            .from("usage_counters")
            .update({ current_value: newValue })
            .match({
              user_id: userRow.id,
              feature_key: "create_product",
              domain: "shop",
            });
        }
      }
    } catch (counterError) {
      // Non-critical — counter self-heals via reconciliation
      console.error("Counter decrement failed (non-critical):", counterError);
    }

    console.log(
      `🗑️  Deleted variant ${variantId} (${variant.color} / ${variant.size}) from product ${productId} for user ${userId}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/products/[id]/variants/[variantId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
