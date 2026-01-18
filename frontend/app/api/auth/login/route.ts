import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
    }

    // Session expiration: 5 days
    // Firebase createSessionCookie expects milliseconds
    const expiresInMs = 60 * 60 * 24 * 5 * 1000; // 5 days in milliseconds
    // Cookie maxAge expects seconds
    const expiresInSeconds = 60 * 60 * 24 * 5; // 5 days in seconds

    // Create the session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: expiresInMs,
    });

    const cookieStore = await cookies();

    cookieStore.set("session", sessionCookie, {
      maxAge: expiresInSeconds,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
