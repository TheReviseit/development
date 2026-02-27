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
    console.log(`[API /store] Fetching slug: "${username}"`);
    console.log(`[API /store] Env check - SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING"}, SERVICE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING"}`);
    const storeData = await getStoreBySlug(username);
    console.log(`[API /store] Result for "${username}": ${storeData ? "FOUND" : "NULL"}`);

    // Store not found or inactive
    if (!storeData) {
      console.log(`[API /store] Returning 404 for: "${username}"`);
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
    console.error("[API /store/[username]] FATAL Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", detail: String(error) },
      { status: 500 },
    );
  }
}
