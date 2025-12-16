/**
 * Embedded Signup API Route
 * Handles the complete embedded signup flow from Meta
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  createFacebookAccount,
  getFacebookAccountByUserId,
  updateFacebookAccount,
  createBusinessManager,
  createWhatsAppAccount,
  createPhoneNumber,
  getBusinessManagersByUserId,
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
      hasCode: !!body.setupData?.code,
      accessTokenLength: body.accessToken?.length,
      userID: body.userID,
      grantedPermissionsCount: body.grantedPermissions?.length,
      setupData: body.setupData,
    });

    let {
      accessToken,
      userID,
      expiresIn,
      grantedPermissions = null, // null = unknown permissions (frontend couldn't check)
      setupData = {},
    } = body;

    // Handle authorization code flow
    // If we have a code but no access token, exchange the code
    if (!accessToken && setupData.code) {
      console.log(
        "🔄 [Embedded Signup API] Exchanging authorization code for access token..."
      );
      try {
        const tokenResponse = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?` +
            `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}` +
            `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
            `&code=${setupData.code}`,
          { method: "GET" }
        );

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          console.error(
            "❌ [Embedded Signup API] Code exchange failed:",
            errorData
          );
          return NextResponse.json(
            {
              error: "Failed to exchange authorization code",
              details: errorData,
            },
            { status: 400 }
          );
        }

        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;

        console.log(
          "✅ [Embedded Signup API] Successfully exchanged code for token"
        );

        // Now get the user ID from the token
        const meResponse = await fetch(
          `https://graph.facebook.com/v21.0/me?access_token=${accessToken}`,
          { method: "GET" }
        );

        if (meResponse.ok) {
          const meData = await meResponse.json();
          userID = meData.id;
          console.log("✅ [Embedded Signup API] Got user ID:", userID);
        }
      } catch (error: any) {
        console.error(
          "❌ [Embedded Signup API] Error during code exchange:",
          error
        );
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
      console.error("❌ [Embedded Signup API] Missing required fields:", {
        accessToken: !!accessToken,
        userID: !!userID,
        hasCode: !!setupData.code,
        receivedBody: body,
      });
      return NextResponse.json(
        {
          error: "Missing required fields: accessToken and userID",
          hint: "Make sure Facebook login completed successfully",
        },
        { status: 400 }
      );
    }

    // Exchange short-lived token for long-lived token (60 days)
    let longLivedToken: string;
    let tokenExpiresIn: number;

    try {
      const exchangeResult = await MetaGraphAPIClient.exchangeToken(
        accessToken
      );
      longLivedToken = exchangeResult.access_token;
      tokenExpiresIn = exchangeResult.expires_in;
      console.log(
        "✅ [Embedded Signup API] Token exchanged, expires in:",
        Math.floor(tokenExpiresIn / 86400),
        "days"
      );
    } catch (error: any) {
      console.error("⚠️ [Embedded Signup API] Token exchange failed:", error.message);
      console.log("⚠️ [Embedded Signup API] Using short-lived token as fallback");
      longLivedToken = accessToken;
      tokenExpiresIn = expiresIn;
    }

    // Create Graph API client
    const graphClient = createGraphAPIClient(longLivedToken);

    // Validate the token before proceeding
    console.log("🔍 [Embedded Signup API] Validating access token...");
    const tokenValidation = await graphClient.validateToken();
    
    if (!tokenValidation.isValid) {
      console.error("❌ [Embedded Signup API] Token validation failed");
      return NextResponse.json(
        {
          error: "Invalid access token",
          hint: "The access token from Facebook is invalid or expired. Please try connecting again.",
        },
        { status: 401 }
      );
    }
    
    console.log("✅ [Embedded Signup API] Token validated successfully");
    console.log("🔍 [Embedded Signup API] Token details:", {
      app_id: tokenValidation.app_id,
      user_id: tokenValidation.user_id,
      expires_at: tokenValidation.expires_at 
        ? new Date(tokenValidation.expires_at * 1000).toISOString() 
        : 'never',
    });

    // Get user profile from Facebook
    const profile = await graphClient.getUserProfile();

    // Calculate token expiration
    const expiresAt = new Date(
      Date.now() + tokenExpiresIn * 1000
    ).toISOString();

    // Encrypt the access token
    const encryptedToken = encryptToken(longLivedToken);

    // Store or update Facebook account
    const existingAccount = await getFacebookAccountByUserId(user.id);

    let facebookAccount;
    if (existingAccount) {
      facebookAccount = await updateFacebookAccount(existingAccount.id, {
        access_token: encryptedToken,
        expires_at: expiresAt,
        granted_permissions: grantedPermissions || [], // Store empty array if null
        status: "active",
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        connection_error: null,
      });
    } else {
      facebookAccount = await createFacebookAccount({
        user_id: user.id,
        facebook_user_id: userID,
        facebook_user_name: profile.name,
        facebook_email: profile.email || null,
        access_token: encryptedToken,
        token_type: "Bearer",
        expires_at: expiresAt,
        granted_permissions: grantedPermissions || [], // Store empty array if null
      });
    }

    
    let businessManagers;
    try {
      businessManagers = await graphClient.getBusinessManagers();
    } catch (error: any) {
      console.error(
        "❌ [Embedded Signup API] Failed to fetch Business Managers:",
        error.message
      );
      
      // Check if it's a permission error
      if (error.message?.includes("403") || error.message?.includes("permission")) {
        return NextResponse.json(
          {
            error: "Missing required permission: business_management",
            hint: "Please accept all permissions when logging in with Facebook. Click the button again and ensure you approve all permission requests.",
            details: error.message,
            grantedPermissions: grantedPermissions,
          },
          { status: 403 }
        );
      }
      
      // Other Graph API errors
      return NextResponse.json(
        {
          error: "Failed to fetch Business Managers from Meta",
          hint: "There was an error communicating with Facebook. Please try again.",
          details: error.message,
        },
        { status: 500 }
      );
    }

    // Validate that at least one Business Manager was found
    if (businessManagers.length === 0) {
      console.error("❌ [Embedded Signup API] No Business Managers found");
      console.error("Possible causes:");
      console.error("1. User doesn't have business_management permission");
      console.error("2. User doesn't have access to any Business Managers");
      console.error("3. Access token is invalid or expired");

      return NextResponse.json(
        {
          error: "No Business Managers found for this account",
          hint: "Please ensure you have access to a Business Manager on Meta Business Suite",
          troubleshooting: [
            "Verify business_management permission was granted",
            "Check if you have access to Meta Business Manager at business.facebook.com",
            "Try creating a Business Manager if you don't have one",
            "Ensure your Facebook account is an admin of the Business Manager",
          ],
        },
        { status: 404 }
      );
    }

    const storedBusinessManagers = [];
    for (const bm of businessManagers) {
      try {
        const storedBM = await createBusinessManager({
          facebook_account_id: facebookAccount.id,
          user_id: user.id,
          business_id: bm.id,
          business_name: bm.name,
          business_email: null,
          business_vertical: null,
          permitted_roles: bm.permitted_roles || [],
        });
        storedBusinessManagers.push(storedBM);
      } catch (error: any) {
        // Ignore duplicate errors
        if (
          !error.message?.includes("duplicate") &&
          !error.code?.includes("23505")
        ) {
          console.error("Error storing business manager:", error);
        }
      }
    }

    // Fetch and store all WhatsApp Business Accounts for each Business Manager
    const allWABAs = [];
    const allPhoneNumbers = [];

    for (const bm of storedBusinessManagers) {
      try {
        // Get WABAs for this business
        const wabas = await graphClient.getWhatsAppBusinessAccounts(
          bm.business_id
        );

        for (const waba of wabas) {
          try {
            const storedWABA = await createWhatsAppAccount({
              business_manager_id: bm.id,
              user_id: user.id,
              waba_id: waba.id,
              waba_name: waba.name || null,
              account_review_status: waba.account_review_status || null,
              business_verification_status:
                waba.business_verification_status || null,
              quality_rating: waba.quality_rating || null,
              messaging_limit_tier: null,
            });
            allWABAs.push(storedWABA);

            // Get phone numbers for this WABA
            const phoneNumbers = await graphClient.getPhoneNumbers(waba.id);

            for (const phone of phoneNumbers) {
              try {
                // Generate webhook verify token
                const verifyToken = crypto.randomBytes(32).toString("hex");
                const encryptedVerifyToken = encryptToken(verifyToken);

                // Webhook URL
                const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/whatsapp/${phone.id}`;

                const storedPhone = await createPhoneNumber({
                  whatsapp_account_id: storedWABA.id,
                  user_id: user.id,
                  phone_number_id: phone.id,
                  display_phone_number: phone.display_phone_number,
                  verified_name: phone.verified_name || null,
                  quality_rating: phone.quality_rating || null,
                  code_verification_status:
                    phone.code_verification_status || null,
                  is_official_business_account:
                    phone.is_official_business_account || false,
                  webhook_url: webhookUrl,
                  webhook_verify_token: encryptedVerifyToken,
                  is_primary: allPhoneNumbers.length === 0, // First phone is primary
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
          } catch (error: any) {
            if (
              !error.message?.includes("duplicate") &&
              !error.code?.includes("23505")
            ) {
              console.error("Error storing WABA:", error);
            }
          }
        }
      } catch (error) {
        console.error(
          `Error fetching WABAs for business ${bm.business_id}:`,
          error
        );
      }
    }

    // Subscribe to webhooks for all phone numbers
    for (const phone of allPhoneNumbers) {
      try {
        const waba = allWABAs.find((w) => w.id === phone.whatsapp_account_id);
        if (waba) {
          // We'll subscribe to webhook in Meta dashboard or via separate call
          // For now, just mark the phone as active
          const { updatePhoneNumber } = await import(
            "@/lib/supabase/facebook-whatsapp-queries"
          );
          await updatePhoneNumber(phone.id, {
            is_active: true,
          });
        }
      } catch (error) {
        console.error("Error subscribing webhook:", error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        facebookAccount: {
          ...facebookAccount,
          access_token: "[ENCRYPTED]",
        },
        businessManagers: storedBusinessManagers,
        whatsappAccounts: allWABAs,
        phoneNumbers: allPhoneNumbers,
        summary: {
          businessManagersCount: storedBusinessManagers.length,
          whatsappAccountsCount: allWABAs.length,
          phoneNumbersCount: allPhoneNumbers.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Embedded signup error:", error);
    return NextResponse.json(
      {
        error: "Failed to complete embedded signup",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
