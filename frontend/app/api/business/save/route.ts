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

    // Save to Firestore - create collection if doesn't exist
    try {
      const docRef = adminDb.collection("businesses").doc(userId);
      await docRef.set(
        {
          ...businessData,
          userId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (dbError: any) {
      console.error("Firestore save error:", dbError);
      // If Firestore fails, try to create the document
      if (dbError.code === 5) {
        // NOT_FOUND - collection may not exist, try creating it
        const docRef = adminDb.collection("businesses").doc(userId);
        await docRef.create({
          ...businessData,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        throw dbError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving business data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save", details: error.code },
      { status: 500 }
    );
  }
}
