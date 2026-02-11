import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Helper to get Firebase token AND user ID
async function getAuthToken(
  request: NextRequest,
): Promise<{ token: string; uid: string } | null> {
  try {
    // Try Authorization header first
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      return { token, uid: "" }; // UID extracted by backend
    }

    // Try session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) {
      return null;
    }

    // Verify session
    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) {
      return null;
    }

    const uid = result.data.uid;
    return { token: sessionCookie, uid };
  } catch (error) {
    console.error("Showcase API auth error:", error);
    return null;
  }
}

// GET - Fetch all showcase items
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(`${BACKEND_URL}/api/showcase/items`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        ...(auth.uid && { "X-User-ID": auth.uid }),
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Showcase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create new showcase item
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/showcase/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
        ...(auth.uid && { "X-User-ID": auth.uid }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Showcase API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
