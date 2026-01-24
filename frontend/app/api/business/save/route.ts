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

    // SAFE UPDATE: Only update fields explicitly provided in request
    // This prevents accidental data deletion when partial updates are sent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbData: Record<string, any> = {
      user_id: userId,
    };

    // Only include fields that are explicitly provided (not undefined)
    if ("businessName" in businessData || "business_name" in businessData) {
      dbData.business_name =
        businessData.businessName || businessData.business_name || "";
    }
    if ("industry" in businessData) {
      dbData.industry = businessData.industry || "";
    }
    if ("customIndustry" in businessData || "custom_industry" in businessData) {
      dbData.custom_industry =
        businessData.customIndustry || businessData.custom_industry || "";
    }
    if ("description" in businessData) {
      dbData.description = businessData.description || "";
    }
    if ("contact" in businessData) {
      dbData.contact = businessData.contact || {};
    }
    if ("socialMedia" in businessData || "social_media" in businessData) {
      dbData.social_media =
        businessData.socialMedia || businessData.social_media || {};
    }
    if ("location" in businessData) {
      dbData.location = businessData.location || {};
    }
    if ("timings" in businessData) {
      dbData.timings = businessData.timings || {};
    }
    // NOTE: Products and product_categories now use normalized tables
    // They are NOT saved here anymore - use /api/products endpoints instead
    if ("products" in businessData) {
      console.log(
        `⚠️ Products sent to /api/business/save - should use /api/products instead`,
      );
      // Don't save to JSONB anymore - ignore this field
    }
    if ("policies" in businessData) {
      dbData.policies = businessData.policies || {};
    }
    if (
      "ecommercePolicies" in businessData ||
      "ecommerce_policies" in businessData
    ) {
      dbData.ecommerce_policies =
        businessData.ecommercePolicies || businessData.ecommerce_policies || {};
    }
    if ("faqs" in businessData) {
      dbData.faqs = businessData.faqs || [];
    }
    if ("brandVoice" in businessData || "brand_voice" in businessData) {
      dbData.brand_voice =
        businessData.brandVoice || businessData.brand_voice || {};
    }
    if ("logoUrl" in businessData) {
      dbData.logo_url = businessData.logoUrl || "";
    }
    if ("logoPublicId" in businessData) {
      dbData.logo_public_id = businessData.logoPublicId || "";
    }
    if ("banners" in businessData) {
      dbData.banners = businessData.banners || [];
    }
    if ("sizeOptions" in businessData || "size_options" in businessData) {
      dbData.size_options =
        businessData.sizeOptions || businessData.size_options || [];
    }
    if ("colorOptions" in businessData || "color_options" in businessData) {
      dbData.color_options =
        businessData.colorOptions || businessData.color_options || [];
    }

    // Check if we have any fields to update besides user_id
    const fieldCount = Object.keys(dbData).length - 1;
    if (fieldCount === 0) {
      return NextResponse.json(
        { error: "No valid fields provided to update" },
        { status: 400 },
      );
    }

    console.log(
      `🔄 Partial update for user ${userId}: ${fieldCount} field(s) - [${Object.keys(
        dbData,
      )
        .filter((k) => k !== "user_id")
        .join(", ")}]`,
    );

    // Upsert to Supabase businesses table
    const { error: supabaseError } = await supabase
      .from("businesses")
      .upsert(dbData, { onConflict: "user_id" });

    if (supabaseError) {
      console.error("Error saving to Supabase:", supabaseError);
      return NextResponse.json(
        { error: "Failed to save options", details: supabaseError.message },
        { status: 500 },
      );
    }

    console.log(`✅ Saved business data to Supabase for user: ${userId}`);

    // NOTE: Products now saved directly via /api/products endpoints
    // No sync needed here

    // Save other business data to Firestore for backward compatibility
    // Run in background (non-blocking) for faster response
    (async () => {
      try {
        // Exclude products from Firestore sync since they're in Supabase now
        const firestoreData = { ...businessData };
        delete firestoreData.products;
        delete firestoreData.productCategories;

        const docRef = adminDb.collection("businesses").doc(userId);
        await docRef.set(
          {
            ...firestoreData,
            userId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        console.log(`✅ Saved business data to Firestore for user: ${userId}`);
      } catch (firestoreError) {
        console.warn("Firestore save failed (non-critical):", firestoreError);
      }
    })();

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
