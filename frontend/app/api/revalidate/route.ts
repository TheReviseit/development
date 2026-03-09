/**
 * Cache Invalidation & ISR Revalidation Endpoint
 * =================================================
 * Called by Flask backend after business/product data is saved.
 *
 * Performs two operations:
 *   1. Invalidates in-memory LRU cache (store data, slug, payment settings)
 *   2. Triggers Next.js ISR on-demand revalidation for the store page
 *
 * Security:
 *   - Protected by shared secret (REVALIDATION_SECRET env var)
 *   - Only accepts POST requests
 *
 * Usage from Flask:
 *   POST /api/revalidate
 *   Headers: { "Authorization": "Bearer <REVALIDATION_SECRET>" }
 *   Body: { "slug": "my-store", "userId": "abc123", "type": "store" }
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  invalidateStore,
  invalidateSlug,
  invalidateByUserId,
  getAllCacheStats,
} from "@/lib/cache/store-cache";

const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET || process.env.REVALIDATE_TOKEN;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify authorization
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (REVALIDATION_SECRET && token !== REVALIDATION_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { slug, userId, type = "store" } = body;

    if (!slug && !userId) {
      return NextResponse.json(
        { error: "Either slug or userId is required" },
        { status: 400 },
      );
    }

    const invalidated: string[] = [];

    // Invalidate in-memory caches
    if (slug) {
      invalidateStore(slug);
      invalidated.push(`store:${slug}`);

      if (type === "slug_change") {
        invalidateSlug(slug);
        invalidated.push(`slug:${slug}`);
      }

      // Revalidate ISR cache for the store page
      try {
        revalidatePath(`/store/${slug}`);
        invalidated.push(`isr:/store/${slug}`);
      } catch (e) {
        console.warn("[revalidate] ISR revalidation failed:", e);
      }
    }

    if (userId) {
      invalidateByUserId(userId);
      invalidated.push(`user:${userId}`);
    }

    console.log(`[revalidate] Invalidated: ${invalidated.join(", ")}`);

    return NextResponse.json({
      success: true,
      invalidated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[revalidate] Error:", error);
    return NextResponse.json(
      { error: "Revalidation failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/revalidate — Cache statistics (debug/monitoring)
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    stats: getAllCacheStats(),
    timestamp: new Date().toISOString(),
  });
}
