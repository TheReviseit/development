import { NextRequest, NextResponse } from "next/server";
import { proxyRequest } from "@/lib/api/proxy-client";

/** Public read-only proxy for billing runtime flags (used by client hooks). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = `flags_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const authHeader = request.headers.get("authorization");

  const proxyResult = await proxyRequest<{ success: boolean; flags: Record<string, unknown> }>(
    "/api/billing/runtime-flags",
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    },
  );

  if (proxyResult.success && proxyResult.data) {
    return NextResponse.json(proxyResult.data, {
      status: 200,
      headers: {
        "X-Request-ID": requestId,
        "Cache-Control": "private, max-age=30",
      },
    });
  }

  return NextResponse.json(
    proxyResult.error || { success: false, message: "Failed to load flags" },
    { status: proxyResult.statusCode || 502, headers: { "X-Request-ID": requestId } },
  );
}
