import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function getAuthToken(
  request: NextRequest,
): Promise<{ token: string; uid: string } | null> {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return { token: authHeader.substring(7), uid: "" };
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) return null;

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) return null;

    return { token: sessionCookie, uid: result.data.uid };
  } catch (error) {
    console.error("Showcase API auth error:", error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const response = await fetch(`${BACKEND_URL}/api/showcase/items/${id}`, {
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = await context.params;

    const response = await fetch(`${BACKEND_URL}/api/showcase/items/${id}`, {
      method: "PATCH",
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const response = await fetch(`${BACKEND_URL}/api/showcase/items/${id}`, {
      method: "DELETE",
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
