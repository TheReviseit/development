/**
 * Embedded Signup API Route (STEP 2)
 * Handles WhatsApp Embedded Signup flow from Meta
 *
 * IMPORTANT: This endpoint does NOT require business_management permission.
 * business_management is obtained via /api/facebook/login-for-business (Step 1)
 *
 * This endpoint:
 * 1. Exchanges authorization code for access token
 * 2. Validates whatsapp_business_management permission
 * 3. Uses setupData (waba_id, phone_number_id) from Embedded Signup
 * 4. Falls back to /me/whatsapp_business_accounts if setupData incomplete
 * 5. Links to existing Business Manager (from Step 1)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  createFacebookAccount,
  getFacebookAccountByUserId,
  updateFacebookAccount,
  createWhatsAppAccount,
  createPhoneNumber,
  getBusinessManagersByUserId,
  getWhatsAppAccountsByUserId,
  updatePhoneNumber,
} from "@/lib/supabase/facebook-whatsapp-queries";
import {
  createGraphAPIClient,
  MetaGraphAPIClient,
} from "@/lib/facebook/graph-api-client";
import { encryptToken } from "@/lib/encryption/crypto";
import crypto from "crypto";

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
    console.log("🔵 [Embedded Signup API] Received body:", {
      hasAccessToken: !!body.accessToken,
      hasUserID: !!body.userID,
      hasCode: !!body.code,
      hasSetupData: !!body.setupData,
      setupData: body.setupData,
    });

    let {
      accessToken,
      userID,
      expiresIn,
      code,
      grantedPermissions = null,
      setupData = {},
    } = body;

    // Determine authorization code (root level preferred, fallback to setupData)
    const authorizationCode = code || setupData.code;

    // Handle Authorization Code Flow
    if (!accessToken && authorizationCode) {
      console.log(
        "🔄 [Embedded Signup API] Exchanging authorization code for access token..."
      );

      try {
        const tokenUrl = new URL(
          "https://graph.facebook.com/v21.0/oauth/access_token"
        );
        tokenUrl.searchParams.append(
          "client_id",
          process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || ""
        );
        tokenUrl.searchParams.append(
          "client_secret",
          process.env.FACEBOOK_APP_SECRET || ""
        );
        tokenUrl.searchParams.append("code", authorizationCode);

        // CRITICAL: Use EXACT redirect_uri from frontend
        // Authorization codes are SINGLE-USE and tied to the exact redirect_uri
        // Trying multiple URIs will invalidate the code on first failure
        const redirectUri = body.redirectUri;

        if (!redirectUri) {
          console.error(
            "❌ [Embedded Signup API] No redirect_uri provided in request body"
          );
          return NextResponse.json(
            {
              error: "redirect_uri is required for Authorization Code Flow",
              hint: "Ensure the frontend sends 'redirectUri' in the request body",
            },
            { status: 400 }
          );
        }

        console.log(
          "🔄 [Embedded Signup API] Exchanging code with redirect_uri:",
          redirectUri
        );
        tokenUrl.searchParams.append("redirect_uri", redirectUri);

        // Make ONE token exchange request (authorization codes are single-use)
        const response = await fetch(tokenUrl.toString(), { method: "GET" });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(
            "❌ [Embedded Signup API] Code exchange failed:",
            JSON.stringify(errorData, null, 2)
          );

          // Provide helpful error messages
          if (
            errorData?.error?.code === 100 &&
            (errorData?.error?.message?.includes("code") ||
              errorData?.error?.error_subcode === 36008)
          ) {
            let hint = "The authorization code could not be exchanged.";
            if (errorData?.error?.error_subcode === 36008) {
              hint = `The redirect_uri doesn't match. Make sure your Facebook App's Valid OAuth Redirect URIs includes: ${redirectUri}`;
            } else {
              hint =
                "The authorization code may have expired or already been used. Please try the OAuth flow again.";
            }

            return NextResponse.json(
              {
                error: "Failed to exchange authorization code",
                hint,
                details: errorData,
              },
              { status: 400 }
            );
          }

          return NextResponse.json(
            {
              error: "Failed to exchange authorization code",
              details: errorData,
            },
            { status: 400 }
          );
        }

        const tokenData = await response.json();
        console.log(
          "✅ [Embedded Signup API] Code exchange succeeded with redirect_uri:",
          redirectUri
        );

        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;

        // Get user ID if not provided
        if (!userID) {
          const meResponse = await fetch(
            `https://graph.facebook.com/v21.0/me?access_token=${accessToken}`
          );
          if (meResponse.ok) {
            const meData = await meResponse.json();
            userID = meData.id;
          }
        }
      } catch (error: any) {
        console.error("❌ [Embedded Signup API] Code exchange error:", error);
        return NextResponse.json(
          {
            error: "Failed to process authorization code",
            message: error.message,
          },
          { status: 500 }
        );
      }
    }

    if (!accessToken || !userID) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken and userID" },
        { status: 400 }
      );
    }

    // Exchange for long-lived token
    let longLivedToken: string;
    let tokenExpiresIn: number;

    try {
      const exchangeResult = await MetaGraphAPIClient.exchangeToken(
        accessToken
      );
      longLivedToken = exchangeResult.access_token;
      tokenExpiresIn = exchangeResult.expires_in;
      console.log("✅ [Embedded Signup API] Long-lived token obtained");
    } catch (error: any) {
      console.warn(
        "⚠️ [Embedded Signup API] Token exchange failed, using short-lived"
      );
      longLivedToken = accessToken;
      tokenExpiresIn = expiresIn || 3600;
    }

    if (!tokenExpiresIn || isNaN(tokenExpiresIn)) {
      tokenExpiresIn = 3600;
    }

    // Create Graph API client and validate token
    const graphClient = createGraphAPIClient(longLivedToken);
    const tokenValidation = await graphClient.validateToken();

    if (!tokenValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    console.log("✅ [Embedded Signup API] Token validated");

    // Validate permissions - ONLY require whatsapp_business_management
    // DO NOT check for business_management (that's Step 1's job)
    console.log("🔍 [Embedded Signup API] Validating WhatsApp permissions...");

    let validatedPermissions: string[] = [];
    try {
      const permissionsResponse = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedToken}`
      );

      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json();
        validatedPermissions =
          permissionsData.data
            ?.filter((p: any) => p.status === "granted")
            ?.map((p: any) => p.permission) || [];

        console.log(
          "✅ [Embedded Signup API] Granted permissions:",
          validatedPermissions
        );
        grantedPermissions = validatedPermissions;

        // ONLY require whatsapp_business_management
        // DO NOT require business_management here
        if (!validatedPermissions.includes("whatsapp_business_management")) {
          console.error(
            "❌ [Embedded Signup API] Missing whatsapp_business_management permission"
          );
          return NextResponse.json(
            {
              error:
                "Missing required permission: whatsapp_business_management",
              hint: "Please complete the WhatsApp Embedded Signup and grant WhatsApp access.",
              grantedPermissions: validatedPermissions,
            },
            { status: 403 }
          );
        }

        console.log(
          "✅ [Embedded Signup API] whatsapp_business_management permission verified"
        );

        // Check for messaging permission (warning only)
        if (!validatedPermissions.includes("whatsapp_business_messaging")) {
          console.warn(
            "⚠️ [Embedded Signup API] Missing whatsapp_business_messaging - messaging features limited"
          );
        }
      }
    } catch (permError) {
      console.warn(
        "⚠️ [Embedded Signup API] Error checking permissions:",
        permError
      );
    }

    // Get user profile
    const profile = await graphClient.getUserProfile();

    // Calculate token expiration
    const expiresAt = new Date(
      Date.now() + tokenExpiresIn * 1000
    ).toISOString();

    // Encrypt token
    const encryptedToken = encryptToken(longLivedToken);

    // Get existing Facebook account (should exist from Step 1)
    const existingAccount = await getFacebookAccountByUserId(user.id);

    let facebookAccount;
    if (existingAccount) {
      // Update with WhatsApp token
      facebookAccount = await updateFacebookAccount(existingAccount.id, {
        access_token: encryptedToken,
        expires_at: expiresAt,
        granted_permissions: [
          ...(existingAccount.granted_permissions || []),
          ...validatedPermissions.filter(
            (p) => !existingAccount.granted_permissions?.includes(p)
          ),
        ],
        status: "active",
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        connection_error: null,
      });
      console.log("✅ [Embedded Signup API] Updated existing Facebook account");
    } else {
      console.warn(
        "⚠️ [Embedded Signup API] No existing Facebook account - user may have skipped Step 1"
      );
      facebookAccount = await createFacebookAccount({
        user_id: user.id,
        facebook_user_id: userID,
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        access_token: encryptedToken,
        token_type: "Bearer",
        expires_at: expiresAt,
        granted_permissions: grantedPermissions || [],
      });
    }

    // Check for existing Business Manager from Step 1
    const businessManagers = await getBusinessManagersByUserId(user.id);
    let businessManagerId: string | null = null;

    if (businessManagers.length > 0) {
      businessManagerId = businessManagers[0].id;
      console.log(
        "✅ [Embedded Signup API] Using Business Manager from Step 1:",
        businessManagers[0].business_name
      );
    } else {
      console.warn(
        "⚠️ [Embedded Signup API] No Business Manager found from Step 1"
      );
    }

    // Get WABA and phone number data from setupData or API
    let wabaId = setupData.wabaId || setupData.waba_id;
    let phoneNumberId = setupData.phoneNumberId || setupData.phone_number_id;

    console.log("🔍 [Embedded Signup API] SetupData:", {
      wabaId,
      phoneNumberId,
    });

    // Fallback: Fetch from API if setupData incomplete
    if (!wabaId) {
      console.log(
        "🔄 [Embedded Signup API] wabaId not in setupData, waiting 2s for Meta to process..."
      );

      // CRITICAL: Wait 2 seconds for Meta to process the new WABA
      // This fixes the race condition where the API returns empty immediately after signup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Try fetching with retries
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(
            `🔄 [Embedded Signup API] Fetching WABAs from API (attempt ${attempt}/${maxRetries})...`
          );

          const wabaResponse = await fetch(
            `https://graph.facebook.com/v21.0/me/whatsapp_business_accounts?access_token=${longLivedToken}`
          );

          if (wabaResponse.ok) {
            const wabaData = await wabaResponse.json();
            console.log(
              "🔍 [Embedded Signup API] API response:",
              JSON.stringify(wabaData)
            );

            if (wabaData.data && wabaData.data.length > 0) {
              wabaId = wabaData.data[0].id;
              console.log(
                "✅ [Embedded Signup API] Found WABA from API:",
                wabaId
              );
              break;
            } else {
              console.warn(
                "⚠️ [Embedded Signup API] API returned empty data array"
              );
            }
          } else {
            const errorBody = await wabaResponse.json().catch(() => ({}));
            console.warn(
              `⚠️ [Embedded Signup API] API error (attempt ${attempt}):`,
              errorBody
            );
          }

          // Wait before retry
          if (attempt < maxRetries) {
            console.log("⏳ [Embedded Signup API] Waiting 3s before retry...");
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } catch (err) {
          console.warn("⚠️ [Embedded Signup API] Error fetching WABAs:", err);
        }
      }
    }

    if (!wabaId) {
      console.error("❌ [Embedded Signup API] Could not determine WABA ID");
      console.error("📋 [Embedded Signup API] Debug info:", {
        setupDataReceived: body.setupData,
        hasCode: !!body.code,
        hasAccessToken: !!body.accessToken,
        validatedPermissions: grantedPermissions,
      });

      return NextResponse.json(
        {
          error: "No WhatsApp Business Account found",
          hint: "The WABA ID was not returned from Embedded Signup and the API fallback also failed.",
          troubleshooting: [
            "1. Make sure you completed the full Embedded Signup flow (selected Business, WABA, and phone number)",
            "2. Check that your Facebook account has a WhatsApp Business Account",
            "3. Try the flow again - sometimes Meta needs a moment to process",
            "4. Check browser console logs for 'waba_id' in the response from Meta",
          ],
          setupData: body.setupData,
          grantedPermissions,
        },
        { status: 404 }
      );
    }

    // Fetch WABA details
    console.log("🔍 [Embedded Signup API] Fetching WABA details for:", wabaId);
    let wabaDetails;
    try {
      wabaDetails = await graphClient.getWABADetails(wabaId);
      console.log("✅ [Embedded Signup API] WABA details:", wabaDetails.name);
    } catch (error: any) {
      console.error(
        "❌ [Embedded Signup API] Failed to fetch WABA details:",
        error.message
      );
      return NextResponse.json(
        {
          error: "Failed to fetch WhatsApp Business Account details",
          hint: "The WABA may not be accessible with these permissions.",
          wabaId,
        },
        { status: 500 }
      );
    }

    // Store WABA
    let storedWABA;
    try {
      storedWABA = await createWhatsAppAccount({
        business_manager_id: businessManagerId || facebookAccount.id,
        user_id: user.id,
        waba_id: wabaId,
        waba_name: wabaDetails.name || null,
        account_review_status: wabaDetails.account_review_status || null,
        business_verification_status:
          wabaDetails.business_verification_status || null,
        quality_rating: wabaDetails.quality_rating || null,
        messaging_limit_tier: null,
      });
      console.log("✅ [Embedded Signup API] Stored WABA:", storedWABA.id);
    } catch (error: any) {
      if (
        error.message?.includes("duplicate") ||
        error.code?.includes("23505")
      ) {
        console.log(
          "ℹ️ [Embedded Signup API] WABA already exists, continuing..."
        );
        const existingWABAs = await getWhatsAppAccountsByUserId(user.id);
        storedWABA = existingWABAs.find((w: any) => w.waba_id === wabaId);
      } else {
        throw error;
      }
    }

    // Ensure we have a valid storedWABA
    if (!storedWABA) {
      console.error("❌ [Embedded Signup API] storedWABA is undefined");
      return NextResponse.json(
        { error: "Failed to store WhatsApp Business Account" },
        { status: 500 }
      );
    }

    // Fetch phone numbers
    const allPhoneNumbers: any[] = [];

    if (phoneNumberId) {
      console.log(
        "🔍 [Embedded Signup API] Fetching phone number:",
        phoneNumberId
      );
      try {
        const phoneDetails = await graphClient.getPhoneNumberDetails(
          phoneNumberId
        );

        const verifyToken = crypto.randomBytes(32).toString("hex");
        const encryptedVerifyToken = encryptToken(verifyToken);
        const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phoneNumberId}`;

        const storedPhone = await createPhoneNumber({
          whatsapp_account_id: storedWABA.id,
          user_id: user.id,
          phone_number_id: phoneNumberId,
          display_phone_number: phoneDetails.display_phone_number,
          verified_name: phoneDetails.verified_name || null,
          quality_rating: phoneDetails.quality_rating || null,
          code_verification_status:
            phoneDetails.code_verification_status || null,
          is_official_business_account:
            phoneDetails.is_official_business_account || false,
          webhook_url: webhookUrl,
          webhook_verify_token: encryptedVerifyToken,
          is_primary: true,
        });
        allPhoneNumbers.push(storedPhone);
        console.log("✅ [Embedded Signup API] Stored phone number");
      } catch (error: any) {
        if (
          !error.message?.includes("duplicate") &&
          !error.code?.includes("23505")
        ) {
          console.error("Error storing phone number:", error);
        }
      }
    } else {
      console.log(
        "🔍 [Embedded Signup API] Fetching all phone numbers for WABA..."
      );
      try {
        const phoneNumbers = await graphClient.getPhoneNumbers(wabaId);

        for (const phone of phoneNumbers) {
          try {
            const verifyToken = crypto.randomBytes(32).toString("hex");
            const encryptedVerifyToken = encryptToken(verifyToken);
            const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phone.id}`;

            const storedPhone = await createPhoneNumber({
              whatsapp_account_id: storedWABA.id,
              user_id: user.id,
              phone_number_id: phone.id,
              display_phone_number: phone.display_phone_number,
              verified_name: phone.verified_name || null,
              quality_rating: phone.quality_rating || null,
              code_verification_status: phone.code_verification_status || null,
              is_official_business_account:
                phone.is_official_business_account || false,
              webhook_url: webhookUrl,
              webhook_verify_token: encryptedVerifyToken,
              is_primary: allPhoneNumbers.length === 0,
            });
            allPhoneNumbers.push(storedPhone);
          } catch (error: any) {
            if (
              !error.message?.includes("duplicate") &&
              !error.code?.includes("23505")
            ) {
              console.error("Error storing phone number:", error);
            }
          }
        }
        console.log(
          "✅ [Embedded Signup API] Stored",
          allPhoneNumbers.length,
          "phone numbers"
        );
      } catch (error) {
        console.error(
          "❌ [Embedded Signup API] Error fetching phone numbers:",
          error
        );
      }
    }

    // Activate phone numbers
    for (const phone of allPhoneNumbers) {
      try {
        await updatePhoneNumber(phone.id, { is_active: true });
      } catch (error) {
        console.error("Error activating phone:", error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        facebookAccount: {
          ...facebookAccount,
          access_token: "[ENCRYPTED]",
        },
        whatsappAccount: storedWABA,
        phoneNumbers: allPhoneNumbers,
        businessManagerLinked: !!businessManagerId,
        summary: {
          step: 2,
          description: "WhatsApp Embedded Signup completed",
          wabaName: storedWABA?.waba_name,
          phoneNumbersCount: allPhoneNumbers.length,
          previousStepCompleted: !!businessManagerId,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [Embedded Signup API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to complete embedded signup",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
