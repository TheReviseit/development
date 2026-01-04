import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
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
        true
      );
      userId = decodedClaims.uid;
    } catch (authError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Get the business data from request body
    const businessData = await request.json();

    // Save to Firestore using set with merge (creates if not exists, updates if exists)
    // This is the fastest approach - single write operation
    const docRef = adminDb.collection("businesses").doc(userId);
    await docRef.set(
      {
        ...businessData,
        userId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving business data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save", details: error.code },
      { status: 500 }
    );
  }
}
