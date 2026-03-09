/**
 * Store Version Endpoint — Lightweight Polling Target
 * =====================================================
 * Returns ONLY the updated_at timestamp for a store.
 *
 * This endpoint is designed for high-frequency polling (every 30s) as a
 * replacement for full store data refetches. The client compares the
 * returned version against its local version — only triggers a full
 * refresh when the version changes.
 *
 * Performance characteristics:
 *   - Single indexed query on businesses(user_id)
 *   - Response size: ~50 bytes (vs ~20KB for full store data)
 *   - Target latency: <20ms
 *   - DB load reduction: ~98% vs full refresh polling
 */

import { NextRequest, NextResponse } from "next/server";
import { getStoreVersion } from "@/lib/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: "Invalid store identifier" },
        { status: 400 },
      );
    }

    const version = await getStoreVersion(username);

    if (!version) {
      return NextResponse.json(
        { version: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { version },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { version: null, error: "Internal error" },
      { status: 500 },
    );
  }
}
