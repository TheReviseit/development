/**
 * Tech Provider Customer Onboarding API Endpoint
 *
 * Called after a customer completes Embedded Signup to:
 * 1. Exchange authorization code for business token
 * 2. Subscribe to webhooks on customer's WABA
 * 3. Register customer's phone number
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { TechProviderOnboardingService } from "@/lib/facebook/tech-provider-onboarding";
import { encryptToken } from "@/lib/encryption/crypto";

export async function POST(request: NextRequest) {
  try {
    // Verify user session
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

    // Parse request body
    const body = await request.json();
    const { code, wabaId, phoneNumberId, pin } = body;

    console.log("🚀 [Onboarding API] Request received:", {
      userId: user.id,
      hasCode: !!code,
      wabaId: wabaId || "NOT PROVIDED",
      phoneNumberId: phoneNumberId || "NOT PROVIDED",
      hasPin: !!pin,
    });

    // Validate required fields
    if (!code) {
      return NextResponse.json(
        {
          error: "Missing required field: code",
          hint: "Authorization code from Embedded Signup is required",
        },
        { status: 400 }
      );
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          error: "Missing required field: wabaId",
          hint: "WhatsApp Business Account ID is required (from message event or callback)",
        },
        { status: 400 }
      );
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        {
          error: "Missing required field: phoneNumberId",
          hint: "Business phone number ID is required (from message event or callback)",
        },
        { status: 400 }
      );
    }

    // Perform customer onboarding
    console.log("📝 [Onboarding API] Starting onboarding process...");
    const result = await TechProviderOnboardingService.onboardCustomer({
      code,
      wabaId,
      phoneNumberId,
      pin,
    });

    if (!result.success) {
      console.error("❌ [Onboarding API] Onboarding failed:", result.error);
      return NextResponse.json(
        {
          error: "Customer onboarding failed",
          message: result.error,
          details: result.details,
        },
        { status: 500 }
      );
    }

    console.log("✅ [Onboarding API] Onboarding completed successfully");

    // TODO: Store business token and customer data in database
    // Example:
    /*
    import { 
      createWhatsAppBusinessAccount,
      updateWhatsAppBusinessAccount 
    } from "@/lib/supabase/facebook-whatsapp-queries";

    const encryptedToken = encryptToken(result.businessToken!);
    
    await createWhatsAppBusinessAccount({
      user_id: user.id,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      business_token: encryptedToken,
      webhook_subscribed: result.webhookSubscribed,
      phone_registered: result.phoneRegistered,
      status: 'active',
    });
    */

    return NextResponse.json({
      success: true,
      data: {
        wabaId,
        phoneNumberId,
        webhookSubscribed: result.webhookSubscribed,
        phoneRegistered: result.phoneRegistered,
        // Do NOT return the business token to the client
        summary: {
          message: "Customer onboarding completed successfully",
          nextSteps: [
            "Customer is now onboarded",
            "Phone number is registered for Cloud API",
            "Webhooks are subscribed",
            "Customer should add payment method at https://business.facebook.com/wa/manage/home/",
          ],
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [Onboarding API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to complete customer onboarding",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
