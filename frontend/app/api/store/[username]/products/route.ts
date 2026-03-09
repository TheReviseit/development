/**
 * Store Products Endpoint — Server-Side Filtering & Pagination
 * ==============================================================
 * High-performance product listing with:
 *   - Server-side filtering (category, price range, search)
 *   - Cursor-based pagination (no OFFSET, constant performance)
 *   - Sorted results (newest, price asc/desc, name)
 *   - All filter predicates pushed to DB (indexed execution)
 *
 * Query parameters:
 *   category  — filter by category name
 *   min_price — minimum price filter
 *   max_price — maximum price filter
 *   search    — full-text search on product name
 *   sort      — newest | price_asc | price_desc | name_asc
 *   cursor    — pagination cursor (created_at of last item)
 *   limit     — page size (default 24, max 100)
 *
 * Performance targets:
 *   - Filter queries: <100ms (indexed)
 *   - Response size: proportional to page size only
 *   - No full table scans
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveSlugToUserId } from "@/lib/resolve-slug";
import { getStoreProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { username } = await params;
    const url = new URL(request.url);

    if (!username) {
      return NextResponse.json(
        { success: false, error: "Invalid store identifier" },
        { status: 400 },
      );
    }

    // Resolve slug → userId (cached)
    const userId = await resolveSlugToUserId(username);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    // Parse query parameters
    const category = url.searchParams.get("category") || undefined;
    const minPriceStr = url.searchParams.get("min_price");
    const maxPriceStr = url.searchParams.get("max_price");
    const sort = (url.searchParams.get("sort") || "newest") as
      | "newest"
      | "price_asc"
      | "price_desc"
      | "name_asc";
    const cursor = url.searchParams.get("cursor") || undefined;
    const search = url.searchParams.get("search") || undefined;
    const limitStr = url.searchParams.get("limit");

    const minPrice = minPriceStr ? parseFloat(minPriceStr) : undefined;
    const maxPrice = maxPriceStr ? parseFloat(maxPriceStr) : undefined;
    const limit = Math.min(Math.max(parseInt(limitStr || "24", 10) || 24, 1), 100);

    // Fetch products with filters
    const result = await getStoreProducts({
      userId,
      category,
      minPrice,
      maxPrice,
      sort,
      cursor,
      limit,
      search,
    });

    return NextResponse.json(
      {
        success: true,
        data: result.products,
        pagination: {
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null,
          totalEstimate: result.totalEstimate,
          pageSize: limit,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("[API /store/products] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
