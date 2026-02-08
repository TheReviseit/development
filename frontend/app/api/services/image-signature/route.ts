import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { getServiceImageSignature } from "@/lib/cloudinary";
import { cookies } from "next/headers";

// Helper to get user ID from session
async function getUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success || !result.data) {
      return null;
    }
    return result.data.uid;
  } catch {
    return null;
  }
}

// POST: Get Cloudinary signature for service image upload
export async function POST() {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const signatureData = await getServiceImageSignature(userId);

    return NextResponse.json({ success: true, data: signatureData });
  } catch (error) {
    console.error("Service image signature error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
