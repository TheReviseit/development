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

export async function GET(request: NextRequest) {
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

    const supabase = getSupabase();

    // PRIORITY 1: Try Supabase businesses table first
    const { data: supabaseData, error: supabaseError } = await supabase
      .from("businesses")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (supabaseData && !supabaseError) {
      console.log(`✅ Loaded business data from Supabase for user: ${userId}`);
      // Convert from snake_case to camelCase for frontend
      const frontendData = {
        businessId: supabaseData.user_id,
        businessName: supabaseData.business_name,
        industry: supabaseData.industry,
        customIndustry: supabaseData.custom_industry,
        description: supabaseData.description,
        contact: supabaseData.contact,
        socialMedia: supabaseData.social_media,
        location: supabaseData.location,
        timings: supabaseData.timings,
        products: supabaseData.products,
        productCategories: supabaseData.product_categories,
        policies: supabaseData.policies,
        ecommercePolicies: supabaseData.ecommerce_policies,
        faqs: supabaseData.faqs,
        brandVoice: supabaseData.brand_voice,
        sizeOptions: supabaseData.size_options,
        colorOptions: supabaseData.color_options,
      };
      return NextResponse.json({ data: frontendData, source: "supabase" });
    }

    // PRIORITY 2: Fall back to Firestore (legacy data)
    try {
      const doc = await adminDb.collection("businesses").doc(userId).get();

      if (doc.exists) {
        console.log(
          `✅ Loaded business data from Firestore for user: ${userId}`,
        );
        return NextResponse.json({ data: doc.data(), source: "firestore" });
      }
    } catch (dbError: unknown) {
      // If collection doesn't exist or document not found, return null
      if (dbError && typeof dbError === "object" && "code" in dbError) {
        const code = (dbError as { code: unknown }).code;
        if (code !== 5) {
          throw dbError;
        }
      }
    }

    // No data found in either source
    return NextResponse.json({ data: null });
  } catch (error: unknown) {
    console.error("Error fetching business data:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch";
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
