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

// POST /api/forms/[id]/regenerate-slug
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;
    const { id } = await params;

    const response = await fetch(
      `${BACKEND_URL}/api/forms/${id}/regenerate-slug`,
      {
        method: "POST",
        headers: { "X-User-Id": userId },
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in POST /api/forms/[id]/regenerate-slug:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
