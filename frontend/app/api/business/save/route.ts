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

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

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
