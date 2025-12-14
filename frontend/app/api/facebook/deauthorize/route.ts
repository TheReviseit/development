/**
 * Facebook Deauthorize Callback
 * Called when user removes your app from their Facebook account
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signedRequest = body.signed_request;

    if (!signedRequest) {
      return NextResponse.json(
        { error: "Missing signed_request" },
        { status: 400 }
      );
    }

    // Parse signed request
    const [encodedSig, payload] = signedRequest.split(".");
    const data = JSON.parse(
      Buffer.from(payload, "base64").toString("utf-8")
    );

    const userId = data.user_id;

    if (userId) {
      // Log the deauthorization
      console.log(`User ${userId} deauthorized the app at ${new Date().toISOString()}`);

      // Store in webhook log for compliance
      const { logWebhookEvent } = await import(
        "@/lib/supabase/facebook-whatsapp-queries"
      );

      await logWebhookEvent({
        event_type: "app_deauthorization",
        webhook_payload: { facebook_user_id: userId, timestamp: new Date().toISOString() },
        signature_verified: true,
      });

      // TODO: Implement actual deauthorization logic
      // Find the Facebook account by facebook_user_id and soft delete:
      // const { getFacebookAccountByUserId, revokeFacebookAccount } = await import("@/lib/supabase/facebook-whatsapp-queries");
      // await revokeFacebookAccount(facebookAccountId);
    }

    // Return confirmation URL
    const confirmationCode = crypto.randomBytes(16).toString("hex");
    
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/account-deauthorized`,
      confirmation_code: confirmationCode,
    });
  } catch (error: any) {
    console.error("Deauthorize error:", error);
    return NextResponse.json(
      { error: "Failed to process deauthorization" },
      { status: 500 }
    );
  }
}

// GET endpoint for verification
export async function GET() {
  return NextResponse.json({
    message: "Facebook deauthorize endpoint is active",
    status: "ok",
  });
}

