import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    // Get the auth token from cookies
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the session cookie
    let userId: string;
    try {
      const decodedClaims = await adminAuth.verifySessionCookie(
        sessionCookie,
        true,
      );
      userId = decodedClaims.uid;
    } catch (authError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Get business data from Firestore
    try {
      const doc = await adminDb.collection("businesses").doc(userId).get();

      if (!doc.exists) {
        // Return empty data if no document exists yet
        return NextResponse.json({ data: null });
      }

      return NextResponse.json({ data: doc.data() });
    } catch (dbError: any) {
      // If collection doesn't exist or document not found, return null
      if (dbError.code === 5) {
        return NextResponse.json({ data: null });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error("Error fetching business data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch", details: error.code },
      { status: 500 },
    );
  }
}
