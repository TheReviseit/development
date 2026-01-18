/**
 * Public Store API Route
 * Fetches store and product data by store slug (userId)
 *
 * This is a PUBLIC endpoint - no authentication required
 * Returns only public-safe data
 */

import { NextRequest, NextResponse } from "next/server";
import { getStoreBySlug, PublicStore } from "@/lib/store";

// Revalidate cache every 60 seconds for better performance
export const revalidate = 60;

interface RouteParams {
  params: Promise<{ storeSlug: string }>;
}

/**
 * GET /api/store/[storeSlug]
 *
 * Response:
 * - 200: { success: true, data: PublicStore }
 * - 404: { success: false, error: "Store not found" }
 * - 500: { success: false, error: "Internal server error" }
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { storeSlug } = await params;

    // Validate slug format (basic sanitization)
    if (!storeSlug || typeof storeSlug !== "string" || storeSlug.length < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid store identifier" },
        { status: 400 },
      );
    }

    // Fetch store data
    const storeData = await getStoreBySlug(storeSlug);

    // Store not found or inactive
    if (!storeData) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    // Return public-safe store data
    return NextResponse.json(
      { success: true, data: storeData },
      {
        status: 200,
        headers: {
          // Cache control for CDN/browser caching
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    // Log error but don't expose details to client
    console.error("[API /store/[storeSlug]] Error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
