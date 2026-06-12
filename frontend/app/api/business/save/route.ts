/**
 * Business Save API Route — THIN PROXY TO FLASK BACKEND
 *
 * ✅ ENTERPRISE FIX: All business writes now go through Flask backend.
 * This route is a pure proxy — no Supabase service-role key, no direct DB writes.
 *
 * Flask endpoint: POST /api/shop/business/update
 * - Enforces entitlements via FeatureGateEngine
 * - Server-side slug change detection (no client flags)
 * - Atomic writes with UNIQUE constraint enforcement
 *
 * Previously this route was 274 lines of service-role Supabase writes
 * with zero entitlement checks. Now it's ~40 lines of pure proxy.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";

export async function POST(request: NextRequest) {
  try {
    // ── AUTH: Verify session cookie ────────────────────────────────────
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = result.data!.uid;

    // ── PARSE BODY ────────────────────────────────────────────────────
    const businessData = await request.json();

    // Strip allow_slug_update — backend detects slug changes itself
    delete businessData.allow_slug_update;

    // ── PROXY TO FLASK BACKEND ────────────────────────────────────────
    const cookieHeader = request.headers.get("cookie") || "";

    const response = await fetch(`${BACKEND_URL}/api/shop/business/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId, // Trusted: already verified above
        Cookie: cookieHeader,
      },
      body: JSON.stringify(businessData),
      cache: "no-store",
    });

    // ── FORWARD RESPONSE ──────────────────────────────────────────────
    const data = await response.json();

    console.log(
      `[Business Save Proxy] ${response.status} for user ${userId} — ` +
        `${Object.keys(businessData).length} field(s)`,
    );

    // ── ENTERPRISE CACHE INVALIDATION (FAANG LEVEL) ───────────────────
    // Aggressively invalidate all related caches immediately on successful save
    if (response.ok) {
      try {
        const { invalidateByUserId } = await import("@/lib/cache/store-cache");
        const { revalidatePath } = await import("next/cache");
        
        // 1. Bust in-memory LRU cache
        invalidateByUserId(userId);
        
        // 2. Bust Next.js App Router Cache (ISR + Data Cache) for the store
        // Use slug from response or request
        const slug = data.slug || data.canonicalSlug || businessData.url_slug || businessData.canonicalSlug;
        if (slug) {
          revalidatePath(`/store/${slug}`, "layout");
          console.log(`[Business Save Proxy] Revalidated layout for /store/${slug}`);
        } else {
          // If we don't have a direct slug, we can't reliably revalidatePath,
          // but invalidateByUserId handles the LRU memory cache.
          console.warn("[Business Save Proxy] No slug found for Next.js ISR revalidation.");
        }
      } catch (err) {
        console.error("[Business Save Proxy] Cache invalidation failed:", err);
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: unknown) {
    console.error("[Business Save Proxy] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Proxy error";
    return NextResponse.json(
      { error: "PROXY_ERROR", message: errorMessage },
      { status: 500 },
    );
  }
}
