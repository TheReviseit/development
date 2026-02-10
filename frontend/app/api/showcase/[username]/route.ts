/**
 * Next.js API Route: GET /api/showcase/[username]
 *
 * ✅ ENTERPRISE URL ROUTING:
 * Proxies to Flask backend which handles:
 * - Business slug resolution (canonical)
 * - Username fallback (legacy)
 * - 301 redirects for non-canonical URLs
 *
 * This route follows redirects and returns the canonical data.
 */

import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    // ✅ ENTERPRISE: Follow redirects automatically
    // Backend returns 301 for non-canonical URLs (e.g., uppercase, old username)
    // fetch() follows redirects by default (redirect: 'follow')
    const response = await fetch(`${BACKEND_URL}/api/showcase/${username}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
      cache: "no-store",
      redirect: "follow", // ✅ Follow 301 redirects automatically
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: "Showcase not found" },
          { status: 404 },
        );
      }
      throw new Error("Failed to fetch showcase");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching showcase:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
