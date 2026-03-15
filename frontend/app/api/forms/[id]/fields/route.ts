import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function verifyUser(): Promise<{ userId: string } | NextResponse> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const result = await verifySessionCookieSafe(sessionCookie, true);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  return { userId: result.data!.uid };
}

// PUT /api/forms/[id]/fields — Bulk update fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/forms/${id}/fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in PUT /api/forms/[id]/fields:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/forms/[id]/fields
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;
    const { id } = await params;

    const response = await fetch(`${BACKEND_URL}/api/forms/${id}/fields`, {
      headers: { "X-User-Id": userId },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in GET /api/forms/[id]/fields:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
