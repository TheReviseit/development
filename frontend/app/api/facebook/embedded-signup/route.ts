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
    const {
      accessToken,
      userID,
      expiresIn,
      grantedPermissions = [],
      setupData = {},
    } = body;

    if (!accessToken || !userID) {
      return NextResponse.json(
        { error: "Missing required fields: accessToken, userID" },
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
    } catch (error) {
      console.error("Token exchange failed:", error);
      longLivedToken = accessToken;
      tokenExpiresIn = expiresIn;
    }

    // Create Graph API client
    const graphClient = createGraphAPIClient(longLivedToken);

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
        granted_permissions: grantedPermissions,
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
        granted_permissions: grantedPermissions,
      });
    }

    // Fetch and store all Business Managers
    const businessManagers = await graphClient.getBusinessManagers();

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

