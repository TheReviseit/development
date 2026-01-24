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

// Helper to verify user session
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

// Helper to log audit events
async function logAudit(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  productId: string,
  action: string,
  changes?: object,
) {
  try {
    await supabase.from("product_audit_log").insert({
      user_id: userId,
      product_id: productId,
      action,
      changes,
      affected_count: 1,
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/products/[id] - Get a single product
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await context.params;
    const supabase = getSupabase();

    // Fetch product - ALWAYS filter by user_id for security
    const { data: product, error } = await supabase
      .from("products")
      .select(
        `
        *,
        category:product_categories(id, name),
        variants:product_variants(*)
      `,
      )
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error in GET /api/products/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PUT /api/products/[id] - Update a product
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await context.params;
    const body = await request.json();
    const supabase = getSupabase();

    // First verify ownership - CRITICAL security check
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("id, name, user_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Build update data - only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if ("name" in body) updateData.name = body.name;
    if ("description" in body) updateData.description = body.description;
    if ("sku" in body) updateData.sku = body.sku || null;
    if ("brand" in body) updateData.brand = body.brand;
    if ("price" in body) updateData.price = parseFloat(body.price) || 0;
    if ("compareAtPrice" in body) {
      updateData.compare_at_price = body.compareAtPrice
        ? parseFloat(body.compareAtPrice)
        : null;
    }
    if ("priceUnit" in body) updateData.price_unit = body.priceUnit;
    if ("stockQuantity" in body) {
      updateData.stock_quantity = parseInt(body.stockQuantity) || 0;
    }
    if ("stockStatus" in body) updateData.stock_status = body.stockStatus;
    if ("imageUrl" in body) updateData.image_url = body.imageUrl;
    if ("imagePublicId" in body)
      updateData.image_public_id = body.imagePublicId;
    if ("duration" in body) updateData.duration = body.duration;
    if ("materials" in body) updateData.materials = body.materials;
    if ("sizes" in body) updateData.sizes = body.sizes;
    if ("colors" in body) updateData.colors = body.colors;
    if ("tags" in body) updateData.tags = body.tags;
    if ("available" in body) updateData.is_available = body.available;
    if ("hasSizePricing" in body)
      updateData.has_size_pricing = body.hasSizePricing;
    if ("sizePrices" in body) updateData.size_prices = body.sizePrices || {};
    if ("sizeStocks" in body) updateData.size_stocks = body.sizeStocks || {};

    // Handle category update - lookup ID from name if necessary
    if ("category" in body || "categoryId" in body) {
      let newCategoryId = body.categoryId || null;

      // If only name provided, look it up
      if (
        !newCategoryId &&
        body.category &&
        typeof body.category === "string"
      ) {
        const { data: cat } = await supabase
          .from("product_categories")
          .select("id")
          .eq("user_id", userId)
          .eq("name", body.category.trim())
          .single();

        if (cat) {
          newCategoryId = cat.id;
        }
      }

      updateData.category_id = newCategoryId;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // Update product
    const { data: product, error: updateError } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId) // Double-check ownership
      .select()
      .single();

    if (updateError) {
      console.error("Error updating product:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Handle variants update if provided
    if ("variants" in body && Array.isArray(body.variants)) {
      // Delete existing variants and re-insert
      await supabase
        .from("product_variants")
        .delete()
        .eq("product_id", id)
        .eq("user_id", userId);

      if (body.variants.length > 0) {
        const variantsData = body.variants.map(
          (v: Record<string, unknown>) => ({
            user_id: userId,
            product_id: id,
            color: v.color || "",
            size: v.size || "",
            price: v.price ? parseFloat(String(v.price)) : null,
            stock_quantity: v.stockQuantity
              ? parseInt(String(v.stockQuantity))
              : 0,
            image_url: v.imageUrl || "",
            image_public_id: v.imagePublicId || "",
            has_size_pricing: v.hasSizePricing || false,
            size_prices: v.sizePrices || {},
          }),
        );

        await supabase.from("product_variants").insert(variantsData);
      }
    }

    // Log audit
    await logAudit(supabase, userId, id, "update", updateData);

    console.log(`✅ Updated product "${product.name}" for user ${userId}`);

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Error in PUT /api/products/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE /api/products/[id] - Soft delete a product
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await context.params;
    const supabase = getSupabase();

    // First verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from("products")
      .select("id, name, user_id, is_deleted")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (existing.is_deleted) {
      return NextResponse.json(
        { error: "Product is already deleted" },
        { status: 400 },
      );
    }

    // Soft delete - set is_deleted = true (trigger will set deleted_at)
    const { error: deleteError } = await supabase
      .from("products")
      .update({
        is_deleted: true,
        deleted_by: userId,
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Error deleting product:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Log audit
    await logAudit(supabase, userId, id, "delete", { name: existing.name });

    console.log(
      `🗑️ Soft-deleted product "${existing.name}" for user ${userId}`,
    );

    return NextResponse.json({
      success: true,
      message: "Product deleted (can be restored)",
    });
  } catch (error) {
    console.error("Error in DELETE /api/products/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
