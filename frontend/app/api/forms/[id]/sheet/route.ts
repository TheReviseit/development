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

// POST /api/forms/[id]/sheet
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyUser();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;
    const { id } = await params;
    
    // Check request body
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Empty body handling
    }

    const response = await fetch(`${BACKEND_URL}/api/forms/${id}/sheet`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-User-Id": userId 
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in POST /api/forms/[id]/sheet:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
