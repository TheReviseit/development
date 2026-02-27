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

// Helper to log audit events (used by GET-adjacent ops that stay in Next.js)
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
// ============================================================================
// UNIFIED WRITE PATH: Proxied to Flask backend.
// Flask handles: auth → @require_limit("create_product") → atomic increment
//                → insert into products table → return 201 or 403.
// No direct DB writes here. No inline limit checks.
// Pattern: identical to showcase/items/route.ts
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();

    const BACKEND_URL =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    // Get session cookie for auth forwarding
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value || "";

    const response = await fetch(`${BACKEND_URL}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionCookie}`,
        "X-User-ID": userId,
        // CRITICAL: Set Origin header so Flask domain middleware knows this is from shop
        // Without this, backend defaults to 'dashboard' and subscription lookup fails
        Origin: process.env.NEXT_PUBLIC_SHOP_URL || "http://localhost:3001",
      },
      body: JSON.stringify(body),
    });

    // Handle non-JSON responses (e.g., Flask error pages)
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error(
        "Backend returned non-JSON response:",
        text.substring(0, 500),
      );
      return NextResponse.json(
        { error: "Backend error - check server logs" },
        { status: 500 },
      );
    }

    const data = await response.json();

    // Map Flask response to match frontend expectations
    if (response.status === 201 && data.product) {
      return NextResponse.json({ product: data.product }, { status: 201 });
    }

    // Pass through error responses (403 limit, 400 validation, 500 etc.)
    // Map Flask's feature gate denial to frontend's expected format
    if (response.status === 403) {
      const errorData = data.decision || data;
      return NextResponse.json(
        {
          error: errorData.error || "PRODUCT_LIMIT_REACHED",
          message:
            errorData.message ||
            "You've reached your plan limit. Upgrade to add more products.",
          code: "PRODUCT_LIMIT_REACHED",
          current: errorData.used ?? errorData.current,
          limit: errorData.hard_limit ?? errorData.limit,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in POST /api/products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
