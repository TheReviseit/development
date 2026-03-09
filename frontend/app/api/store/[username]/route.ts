/**
 * Public Store API Route — Cached
 * =================================
 * Returns full store data by slug.
 *
 * Performance optimizations:
 *   - In-memory LRU cache (30s fresh, 120s stale-while-revalidate)
 *   - Parallel batched DB queries (on cache miss)
 *   - Selective field fetching (no SELECT *)
 *   - Short CDN cache (s-maxage=10) for edge caching
 *
 * This is a PUBLIC endpoint — no authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/store";

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

    if (!username || typeof username !== "string" || username.length < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid store identifier" },
        { status: 400 },
      );
    }

    // getStoreBySlug now has built-in LRU cache with stale-while-revalidate
    const storeData = await getStoreBySlug(username);

    if (!storeData) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, data: storeData },
      {
        status: 200,
        headers: {
          // Allow short CDN caching (10s) with stale-while-revalidate (30s)
          // This dramatically reduces origin hits for popular stores
          "Cache-Control":
            "public, s-maxage=10, stale-while-revalidate=30",
          // Vary on nothing — store data is public, no auth-dependent variation
          Vary: "Accept-Encoding",
        },
      },
    );
  } catch (error) {
    console.error("[API /store] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
