/**
 * Public Store API Route
 * Fetches store and product data by store slug (userId)
 *
 * This is a PUBLIC endpoint - no authentication required
 * Returns only public-safe data
 */

import { NextRequest, NextResponse } from "next/server";
import { getStoreBySlug, PublicStore } from "@/lib/store";

// Disable caching for real-time updates
// Products can change at any time from Dashboard, so we need fresh data
export const revalidate = 0;
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ username: string }>;
}

/**
 * GET /api/store/[username]
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
    const { username } = await params;

    // Validate slug format (basic sanitization)
    if (!username || typeof username !== "string" || username.length < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid store identifier" },
        { status: 400 },
      );
    }

    // Fetch store data
    const storeData = await getStoreBySlug(username);

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
          // Disable CDN/browser caching for real-time updates
          // Store data can change at any time from Dashboard
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    // Log error but don't expose details to client
    console.error("[API /store/[username]] Error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
