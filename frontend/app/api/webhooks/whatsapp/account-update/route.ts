/**
 * WhatsApp account_update Webhook Handler
 *
 * This webhook is triggered when a customer successfully completes the Embedded Signup flow.
 * It contains critical business information that you need to capture.
 *
 * Documentation: https://developers.facebook.com/docs/whatsapp/embedded-signup/webhooks
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * GET - Webhook Verification
 * Facebook sends a verification request when you first configure the webhook
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    console.log("🔔 [Webhook] Verification request received:", {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    });

    // Check if mode and token are correct
    const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
      console.error(
        "❌ [Webhook] FACEBOOK_WEBHOOK_VERIFY_TOKEN not configured"
      );
      return NextResponse.json(
        { error: "Webhook verify token not configured" },
        { status: 500 }
      );
    }

    if (mode === "subscribe" && token === verifyToken) {
      console.log("✅ [Webhook] Verification successful");
      // Respond with 200 OK and challenge token from Facebook
      return new NextResponse(challenge, { status: 200 });
    } else {
      console.error("❌ [Webhook] Verification failed:", {
        expectedToken: verifyToken,
        receivedToken: token,
      });
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 403 }
      );
    }
  } catch (error: any) {
    console.error("❌ [Webhook] Verification error:", error);
    return NextResponse.json(
      { error: "Webhook verification failed", message: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST - Webhook Event Handler
 * Receives account_update events when customers complete Embedded Signup
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature for security
    const signature = request.headers.get("x-hub-signature-256");
    const body = await request.text();

    if (!verifyWebhookSignature(body, signature)) {
      console.error("❌ [Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    // Parse the webhook payload
    const data = JSON.parse(body);
    console.log("🔔 [Webhook] Received event:", JSON.stringify(data, null, 2));

    // Process each entry
    if (data.entry && Array.isArray(data.entry)) {
      for (const entry of data.entry) {
        // Process changes
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.field === "account_update") {
              await handleAccountUpdate(change.value);
            }
          }
        }
      }
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("❌ [Webhook] Processing error:", error);
    // Still return 200 to prevent Facebook from retrying
    return NextResponse.json(
      { error: "Processing failed", message: error.message },
      { status: 200 }
    );
  }
}

/**
 * Verify webhook signature to ensure request is from Facebook
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null
): boolean {
  if (!signature) {
    console.error("❌ [Webhook] No signature provided");
    return false;
  }

  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) {
    console.error("❌ [Webhook] FACEBOOK_APP_SECRET not configured");
    return false;
  }

  try {
    // Facebook sends signature as "sha256=<hash>"
    const [algorithm, hash] = signature.split("=");

    if (algorithm !== "sha256") {
      console.error("❌ [Webhook] Unexpected signature algorithm:", algorithm);
      return false;
    }

    // Calculate expected signature
    const expectedHash = crypto
      .createHmac("sha256", appSecret)
      .update(payload)
      .digest("hex");

    // Compare hashes using timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(expectedHash)
    );

    if (!isValid) {
      console.error("❌ [Webhook] Signature mismatch");
    }

    return isValid;
  } catch (error) {
    console.error("❌ [Webhook] Signature verification error:", error);
    return false;
  }
}

/**
 * Handle account_update webhook event
 * This is where you capture the customer's business information
 */
async function handleAccountUpdate(value: any) {
  console.log("📨 [Webhook] Processing account_update event:", value);

  try {
    // Extract customer business information
    const phoneNumberId = value.phone_number_id;
    const wabaId = value.waba_id;
    const businessId = value.business_id;

    console.log("✅ [Webhook] Customer business data:", {
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      business_id: businessId,
    });

    // TODO: Store this information in your database
    // You'll need to:
    // 1. Match this data to a user (possibly by businessId or based on recent signup attempts)
    // 2. Update the user's WhatsApp Business Account record
    // 3. Store the phone number ID for sending messages

    // Example implementation (you'll need to adapt to your database schema):
    /*
    import { 
      updateWhatsAppBusinessAccount,
      createWhatsAppBusinessPhone 
    } from "@/lib/supabase/facebook-whatsapp-queries";

    // Update or create WABA record
    await updateWhatsAppBusinessAccount(wabaId, {
      business_id: businessId,
      phone_number_id: phoneNumberId,
      status: 'active',
      connected_at: new Date().toISOString(),
    });

    // Store phone number
    await createWhatsAppBusinessPhone({
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      business_id: businessId,
    });
    */

    console.log(
      "ℹ️ [Webhook] TODO: Implement database storage for business data"
    );
  } catch (error) {
    console.error("❌ [Webhook] Error processing account_update:", error);
    throw error;
  }
}
