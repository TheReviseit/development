import { NextRequest, NextResponse } from "next/server";
import {
  getUserByFirebaseUID,
  createUser,
  createOrUpdateBusiness,
  getBusinessByUserId,
} from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const firebaseUID = request.headers.get("firebase-uid");
    const body = await request.json();

    if (!firebaseUID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create user
    let user = await getUserByFirebaseUID(firebaseUID);

    if (!user) {
      // This shouldn't happen normally, but handle it
      return NextResponse.json(
        { error: "User not found. Please sign up first." },
        { status: 404 }
      );
    }

    // Create or update business
    const business = await createOrUpdateBusiness(user.id, {
      business_name: body.businessName,
      category: body.category,
      website: body.website || "",
      address: body.address || "",
      logo_url: body.logoUrl || "",
      description: body.description || "",
      timezone: "UTC", // Will be set in step 3
      language: "English",
    });

    return NextResponse.json({ success: true, business });
  } catch (error: any) {
    console.error("Error saving business data:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const firebaseUID = request.headers.get("firebase-uid");

    if (!firebaseUID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByFirebaseUID(firebaseUID);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const business = await getBusinessByUserId(user.id);

    return NextResponse.json({ business });
  } catch (error: any) {
    console.error("Error fetching business data:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
