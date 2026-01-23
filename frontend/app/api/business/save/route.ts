import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe, adminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
  try {
    // Get the auth token from cookies
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the session cookie
    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const userId = result.data!.uid;

    // Get the business data from request body
    const businessData = await request.json();

    const supabase = getSupabase();

    // Convert from frontend camelCase to database snake_case
    const dbData = {
      user_id: userId,
      business_name:
        businessData.businessName || businessData.business_name || "",
      industry: businessData.industry || "",
      custom_industry:
        businessData.customIndustry || businessData.custom_industry || "",
      description: businessData.description || "",
      contact: businessData.contact || {},
      social_media: businessData.socialMedia || businessData.social_media || {},
      location: businessData.location || {},
      timings: businessData.timings || {},
      products: businessData.products || [],
      product_categories:
        businessData.productCategories || businessData.product_categories || [],
      policies: businessData.policies || {},
      ecommerce_policies:
        businessData.ecommercePolicies || businessData.ecommerce_policies || {},
      faqs: businessData.faqs || [],
      brand_voice: businessData.brandVoice || businessData.brand_voice || {},
    };

    // Upsert to Supabase businesses table
    const { error: supabaseError } = await supabase
      .from("businesses")
      .upsert(dbData, { onConflict: "user_id" });

    if (supabaseError) {
      console.error("Error saving to Supabase:", supabaseError);
      // Fall through to try Firestore as backup
    } else {
      console.log(`✅ Saved business data to Supabase for user: ${userId}`);
    }

    // Also save to Firestore for backward compatibility during migration
    try {
      const docRef = adminDb.collection("businesses").doc(userId);
      await docRef.set(
        {
          ...businessData,
          userId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      console.log(`✅ Saved business data to Firestore for user: ${userId}`);
    } catch (firestoreError) {
      console.warn("Firestore save failed (non-critical):", firestoreError);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error saving business data:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to save";
    const errorCode =
      error instanceof Error && "code" in error
        ? (error as Error & { code: string }).code
        : undefined;
    return NextResponse.json(
      { error: errorMessage, details: errorCode },
      { status: 500 },
    );
  }
}
