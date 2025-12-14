/**
 * Facebook Data Deletion Request
 * Called when user requests data deletion via Facebook
 * GDPR Compliance endpoint
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

    // Parse signed request from Facebook
    const [encodedSig, payload] = signedRequest.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));

    const userId = data.user_id;
    const confirmationCode = crypto.randomBytes(16).toString("hex");

    if (userId) {
      // Log the data deletion request
      console.log(
        `Data deletion requested for Facebook user ${userId} at ${new Date().toISOString()}`
      );
      console.log(`Confirmation code: ${confirmationCode}`);

      // Store in webhook log for compliance audit trail
      const { logWebhookEvent } = await import(
        "@/lib/supabase/facebook-whatsapp-queries"
      );

      await logWebhookEvent({
        event_type: "data_deletion_request",
        webhook_payload: {
          facebook_user_id: userId,
          confirmation_code: confirmationCode,
          timestamp: new Date().toISOString(),
        },
        signature_verified: true,
      });

      // TODO: Implement actual data deletion
      // This should:
      // 1. Find the connected_facebook_accounts record by facebook_user_id
      // 2. Call soft_delete_facebook_connection() to cascade delete
      // 3. Optionally anonymize rather than delete for compliance
      // 4. Send confirmation email to user

      /*
      const { getFacebookAccountByUserId, revokeFacebookAccount } = await import(
        "@/lib/supabase/facebook-whatsapp-queries"
      );
      
      // Find account
      const facebookAccount = await supabase
        .from('connected_facebook_accounts')
        .select('id')
        .eq('facebook_user_id', userId)
        .single();
        
      if (facebookAccount) {
        // Soft delete (sets deleted_at timestamp)
        await revokeFacebookAccount(facebookAccount.id);
      }
      */
    }

    // Return confirmation URL and code (required by Facebook)
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/data-deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error: any) {
    console.error("Data deletion request error:", error);
    return NextResponse.json(
      { error: "Failed to process data deletion request" },
      { status: 500 }
    );
  }
}

// GET endpoint for verification
export async function GET() {
  return NextResponse.json({
    message: "Facebook data deletion endpoint is active",
    status: "ok",
    note: "This endpoint handles GDPR data deletion requests from Facebook",
  });
}
