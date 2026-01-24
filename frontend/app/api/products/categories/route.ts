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

// GET /api/products/categories - List all categories for the user
export async function GET() {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order");

    if (error) {
      console.error("Error fetching categories:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories: data || [] });
  } catch (error) {
    console.error("Error in GET /api/products/categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/products/categories - Create a new category
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const body = await request.json();
    const supabase = getSupabase();

    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 },
      );
    }

    const categoryData = {
      user_id: userId,
      name: body.name.trim(),
      slug: body.name.trim().toLowerCase().replace(/\s+/g, "-"),
      description: body.description || "",
      sort_order: body.sortOrder || 0,
    };

    const { data: category, error } = await supabase
      .from("product_categories")
      .insert(categoryData)
      .select()
      .single();

    if (error) {
      // Check for duplicate
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Category already exists" },
          { status: 409 },
        );
      }
      console.error("Error creating category:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Created category "${category.name}" for user ${userId}`);

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/products/categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE /api/products/categories - Delete a category (via query param)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("id");
    const categoryName = searchParams.get("name");

    if (!categoryId && !categoryName) {
      return NextResponse.json(
        { error: "Category id or name is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    // Build query
    let query = supabase
      .from("product_categories")
      .delete()
      .eq("user_id", userId);

    if (categoryId) {
      query = query.eq("id", categoryId);
    } else if (categoryName) {
      query = query.eq("name", categoryName);
    }

    const { error } = await query;

    if (error) {
      console.error("Error deleting category:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`🗑️ Deleted category for user ${userId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/products/categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
