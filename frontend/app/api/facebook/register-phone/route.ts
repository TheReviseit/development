/**
 * Register Phone Number with WhatsApp Cloud API
 *
 * This endpoint:
 * 1. Checks the current phone number status via Meta API
 * 2. Attempts to register it with the Cloud API if not already registered
 * 3. Returns full diagnostic info
 *
 * POST /api/facebook/register-phone
 * Body: { phoneNumberId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  getFacebookAccountByUserId,
  getPhoneNumberByPhoneNumberId,
  getWhatsAppAccountsByUserId,
} from "@/lib/supabase/facebook-whatsapp-queries";
import { decryptToken } from "@/lib/encryption/crypto";

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
      true,
    );
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { phoneNumberId } = body;

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "Missing phoneNumberId" },
        { status: 400 },
      );
    }

    // Verify the phone belongs to this user
    const phoneRecord = await getPhoneNumberByPhoneNumberId(phoneNumberId);
    if (!phoneRecord) {
      return NextResponse.json(
        { error: "Phone number not found in database" },
        { status: 404 },
      );
    }

    if (phoneRecord.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized - phone number belongs to another user" },
        { status: 403 },
      );
    }

    // Get Facebook account to retrieve access token
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { error: "Facebook account not connected" },
        { status: 400 },
      );
    }

    const accessToken = decryptToken(facebookAccount.access_token);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Failed to decrypt access token" },
        { status: 500 },
      );
    }

    // STEP 1: Check current phone number status from Meta API
    console.log(
      `🔍 [Register Phone] Checking status for phone ${phoneNumberId}...`,
    );

    let phoneStatus: any = null;
    try {
      const statusResponse = await fetch(
        `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,is_official_business_account,account_mode,is_pin_enabled,name_status,quality_rating,messaging_limit_tier`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (statusResponse.ok) {
        phoneStatus = await statusResponse.json();
        console.log(
          `📱 [Register Phone] Phone status:`,
          JSON.stringify(phoneStatus, null, 2),
        );
      } else {
        const statusError = await statusResponse.json().catch(() => ({}));
        console.warn(
          `⚠️ [Register Phone] Could not fetch phone status:`,
          JSON.stringify(statusError, null, 2),
        );
        phoneStatus = { error: statusError };
      }
    } catch (err) {
      console.warn(`⚠️ [Register Phone] Status check error:`, err);
    }

    // STEP 2: Check WABA webhook subscription status
    let wabaStatus: any = null;
    const wabaAccounts = await getWhatsAppAccountsByUserId(user.id);
    if (wabaAccounts.length > 0) {
      const wabaId = wabaAccounts[0].waba_id;
      try {
        const subsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${wabaId}/subscribed_apps`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (subsResponse.ok) {
          wabaStatus = await subsResponse.json();
          console.log(
            `📡 [Register Phone] WABA subscriptions:`,
            JSON.stringify(wabaStatus, null, 2),
          );
        }
      } catch (err) {
        console.warn(`⚠️ [Register Phone] WABA check error:`, err);
      }
    }

    // STEP 3: Deregister first (clears stale registration), then re-register
    console.log(
      `🔄 [Register Phone] Step 3a: Deregistering ${phoneNumberId} first...`,
    );

    try {
      const deregResponse = await fetch(
        `https://graph.facebook.com/v24.0/${phoneNumberId}/deregister`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ messaging_product: "whatsapp" }),
        },
      );
      const deregData = await deregResponse.json().catch(() => ({}));
      console.log(
        `📋 [Register Phone] Deregister result (HTTP ${deregResponse.status}):`,
        JSON.stringify(deregData, null, 2),
      );
    } catch (deregErr) {
      console.warn(`⚠️ [Register Phone] Deregister error (non-fatal):`, deregErr);
    }

    // Wait 3 seconds for Meta to process deregistration
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // STEP 3b: Now register
    console.log(
      `🔄 [Register Phone] Step 3b: Registering ${phoneNumberId}...`,
    );

    const registrationPin = String(
      Math.floor(100000 + Math.random() * 900000),
    );

    const registerResponse = await fetch(
      `https://graph.facebook.com/v24.0/${phoneNumberId}/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: registrationPin,
        }),
      },
    );

    const registerResponseStatus = registerResponse.status;
    let registerResult: any;

    if (registerResponse.ok) {
      registerResult = await registerResponse.json();
      console.log(
        `✅ [Register Phone] Registered successfully:`,
        registerResult,
      );

      return NextResponse.json({
        success: true,
        registered: true,
        phoneNumberId,
        phoneStatus,
        wabaSubscriptions: wabaStatus,
        registerResult,
        message: "Phone number registered with WhatsApp Cloud API",
      });
    }

    registerResult = await registerResponse.json().catch(() => ({}));
    console.error(
      `❌ [Register Phone] Registration failed (HTTP ${registerResponseStatus}):`,
      JSON.stringify(registerResult, null, 2),
    );

    // Error code 33 means already registered
    const metaErrorCode = registerResult?.error?.code;
    if (metaErrorCode === 33) {
      return NextResponse.json({
        success: true,
        registered: true,
        alreadyRegistered: true,
        phoneNumberId,
        phoneStatus,
        wabaSubscriptions: wabaStatus,
        message:
          "Phone number was already registered — incoming messages should work",
      });
    }

    return NextResponse.json(
      {
        error: "Phone registration failed",
        httpStatus: registerResponseStatus,
        metaError: registerResult?.error,
        phoneNumberId,
        phoneStatus,
        wabaSubscriptions: wabaStatus,
        hint: getHint(metaErrorCode, registerResult),
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("❌ [Register Phone] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to register phone number",
        message: error.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}

function getHint(errorCode: number | undefined, result: any): string {
  const subcode = result?.error?.error_subcode;
  switch (errorCode) {
    case 100:
      if (subcode === 2388093)
        return "Phone number needs to be verified first. Complete verification in Meta Business Suite.";
      return "Invalid parameter sent to Meta API. Check the phone number ID is correct.";
    case 10:
      return "Permission denied. The access token may not have whatsapp_business_messaging permission.";
    case 131009:
      return "This phone number is not eligible for Cloud API. It may need to be migrated from On-Premises API.";
    case 131031:
      return "The business associated with this phone has not been verified by Meta yet.";
    case 33:
      return "Phone is already registered (this is actually fine).";
    default:
      return "Check Meta Business Suite for phone number status and ensure the business is verified.";
  }
}
