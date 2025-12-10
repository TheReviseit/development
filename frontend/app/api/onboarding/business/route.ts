import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import {
  getUserByFirebaseUID,
  createUser,
  createOrUpdateBusiness,
  getBusinessByUserId,
} from "@/lib/supabase/queries";
import { businessOnboardingSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    const firebaseUID = decodedClaims.uid;
    const body = await request.json();

    // ✅ SECURE: Validate input with Zod
    const validationResult = businessOnboardingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
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

    // Create or update business with validated data
    const validated = validationResult.data;
    const business = await createOrUpdateBusiness(user.id, {
      business_name: validated.businessName,
      category: validated.category,
      website: validated.website || "",
      address: validated.address || "",
      logo_url: validated.logoUrl || "",
      description: validated.description || "",
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
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    const firebaseUID = decodedClaims.uid;

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
