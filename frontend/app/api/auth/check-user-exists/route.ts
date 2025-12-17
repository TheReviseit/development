import { NextRequest, NextResponse } from "next/server";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserCache } from "@/app/utils/userCache";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
    }

    // Verify Firebase token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const firebaseUID = decodedToken.uid;

    // Try cache first for O(1) lookup
    const cache = getUserCache();
    let user = await cache.get(firebaseUID, "firebase_uid");

    if (!user) {
      // Cache miss - query database
      console.log("[check-user-exists] Cache miss, querying database");
      user = await getUserByFirebaseUID(firebaseUID);

      // Update cache for future lookups
      if (user) {
        cache.set(user);
      }
    }

    return NextResponse.json({
      exists: !!user,
      user: user || null,
    });
  } catch (error: any) {
    console.error("Error checking user existence:", error);
    return NextResponse.json(
      { error: "Failed to verify user" },
      { status: 500 }
    );
  }
}
