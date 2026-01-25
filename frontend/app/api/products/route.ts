import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// Initialize Supabase with service role (bypasses RLS)
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
  productId: string | null,
  action: string,
  changes?: object,
  affectedCount = 1,
) {
  try {
    await supabase.from("product_audit_log").insert({
      user_id: userId,
      product_id: productId,
      action,
      changes,
      affected_count: affectedCount,
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

// GET /api/products - List all products for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    // Query params for filtering
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query - ALWAYS filter by user_id for security
    let query = supabase
      .from("products")
      .select(
        `
        *,
        category:product_categories(id, name),
        variants:product_variants(*)
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter out deleted unless explicitly requested
    if (!includeDeleted) {
      query = query.eq("is_deleted", false);
    }

    // Optional category filter
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    // Optional search
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching products:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch categories for the user
    const { data: categories } = await supabase
      .from("product_categories")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order");

    return NextResponse.json({
      products: data || [],
      categories: categories || [],
      total: data?.length || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/products - Create a new product
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const supabase = getSupabase();

    // Validate required fields
    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 },
      );
    }

    // Lookup category_id if name provided
    let categoryId = body.categoryId || null;
    if (body.category && typeof body.category === "string") {
      const { data: cat } = await supabase
        .from("product_categories")
        .select("id")
        .eq("user_id", userId)
        .eq("name", body.category.trim())
        .single();

      if (cat) {
        categoryId = cat.id;
      }
    }

    // Build product data - ALWAYS set user_id from session
    const productData = {
      user_id: userId,
      name: body.name.trim(),
      description: body.description || "",
      sku: body.sku || null,
      brand: body.brand || "",
      price: parseFloat(body.price) || 0,
      compare_at_price: body.compareAtPrice
        ? parseFloat(body.compareAtPrice)
        : null,
      price_unit: body.priceUnit || "INR",
      stock_quantity: parseInt(body.stockQuantity) || 0,
      stock_status: body.stockStatus || "in_stock",
      image_url: body.imageUrl || "",
      image_public_id: body.imagePublicId || "",
      duration: body.duration || "",
      materials: body.materials || [],
      sizes: body.sizes || [],
      colors: body.colors || [],
      tags: body.tags || [],
      is_available: body.available !== false,
      category_id: categoryId,
      has_size_pricing: body.hasSizePricing || false,
      size_prices: body.sizePrices || {},
      size_stocks: body.sizeStocks || {},
    };

    // Insert product
    const { data: product, error } = await supabase
      .from("products")
      .insert(productData)
      .select()
      .single();

    if (error) {
      console.error("Error creating product:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Insert variants if provided
    if (
      body.variants &&
      Array.isArray(body.variants) &&
      body.variants.length > 0
    ) {
      const variantsData = body.variants.map((v: Record<string, unknown>) => ({
        user_id: userId,
        product_id: product.id,
        color: v.color || "",
        size: v.size || "",
        price: v.price ? parseFloat(String(v.price)) : null,
        compare_at_price: v.compareAtPrice
          ? parseFloat(String(v.compareAtPrice))
          : null,
        stock_quantity: v.stockQuantity ? parseInt(String(v.stockQuantity)) : 0,
        image_url: v.imageUrl || "",
        image_public_id: v.imagePublicId || "",
        has_size_pricing: v.hasSizePricing || false,
        size_prices: v.sizePrices || {},
        size_stocks: v.sizeStocks || {},
      }));

      await supabase.from("product_variants").insert(variantsData);
    }

    // Log audit
    await logAudit(supabase, userId, product.id, "create", {
      name: product.name,
    });

    console.log(`✅ Created product "${product.name}" for user ${userId}`);

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
