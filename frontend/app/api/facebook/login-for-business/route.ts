/**
 * Facebook Login for Business API Route
 * STEP 1: Handles Facebook OAuth to get business_management permission
 *
 * This endpoint:
 * 1. Exchanges authorization code for access token
 * 2. Validates business_management permission is present
 * 3. Fetches Business Managers
 * 4. Stores Facebook account and Business Managers
 *
 * IMPORTANT: This does NOT fetch WhatsApp accounts (that's Embedded Signup's job)
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
  getBusinessManagersByUserId,
} from "@/lib/supabase/facebook-whatsapp-queries";
import {
  createGraphAPIClient,
  MetaGraphAPIClient,
} from "@/lib/facebook/graph-api-client";
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
    console.log("🔵 [Login for Business API] Received body:", {
      hasAccessToken: !!body.accessToken,
      hasUserID: !!body.userID,
      hasCode: !!body.code,
    });

    let {
      accessToken,
      userID,
      expiresIn,
      code,
      grantedPermissions = null,
    } = body;

    // Handle Authorization Code Flow
    if (!accessToken && code) {
      console.log(
        "🔄 [Login for Business API] Exchanging authorization code..."
      );

      try {
        const redirectUri = "";

        console.log(
          "🔄 [Login for Business API] Exchanging code with redirect_uri:",
          redirectUri
        );

        // Log the request being sent
        console.log("Token exchange request:", {
          endpoint: "https://graph.facebook.com/v24.0/oauth/access_token",
          client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET
            ? "PRESENT (starts with " +
              process.env.FACEBOOK_APP_SECRET.substring(0, 4) +
              ")"
            : "MISSING",
          redirect_uri: redirectUri,
          code: code ? code.substring(0, 10) + "..." : "MISSING",
          grant_type: "authorization_code",
        });

        const params = new URLSearchParams({
          client_id: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID!,
          client_secret: process.env.FACEBOOK_APP_SECRET!,
          redirect_uri: redirectUri,
          code,
          grant_type: "authorization_code",
        });

        const response = await fetch(
          `https://graph.facebook.com/v24.0/oauth/access_token?${params.toString()}`,
          { method: "GET" }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error(
            "❌ [Login for Business API] Code exchange failed:",
            JSON.stringify(errorData, null, 2)
          );
          console.error("📋 [Login for Business API] Debug info:", {
            redirectUri,
            hasCode: !!code,
            codeLength: code?.length,
            errorCode: errorData?.error?.code,
            errorMessage: errorData?.error?.message,
            errorSubcode: errorData?.error?.error_subcode,
          });

          // Provide helpful error messages
          let hint =
            "The authorization code could not be exchanged for an access token.";
          if (
            errorData?.error?.message?.includes("redirect_uri") ||
            errorData?.error?.error_subcode === 36008
          ) {
            hint = `The redirect_uri doesn't match. Make sure your Facebook App's Valid OAuth Redirect URIs includes exactly: ${redirectUri}`;
          } else if (errorData?.error?.message?.includes("code")) {
            hint =
              "The authorization code may have expired or already been used. Please try the OAuth flow again.";
          }

          return NextResponse.json(
            {
              error: "Failed to exchange authorization code",
              hint,
              details: errorData,
              debug: {
                redirectUri,
              },
            },
            { status: 400 }
          );
        }

        const tokenData = await response.json();
        console.log(
          "✅ [Login for Business API] Code exchange succeeded with redirect_uri:",
          redirectUri
        );

        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;
        console.log("✅ [Login for Business API] Token received");

        // Get user ID if not provided
        if (!userID) {
          const meResponse = await fetch(
            `https://graph.facebook.com/v24.0/me?access_token=${accessToken}`
          );
          if (meResponse.ok) {
            const meData = await meResponse.json();
            userID = meData.id;
          }
        }
      } catch (error: any) {
        console.error(
          "❌ [Login for Business API] Code exchange error:",
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
      console.log("✅ [Login for Business API] Long-lived token obtained");
    } catch (error: any) {
      console.warn(
        "⚠️ [Login for Business API] Token exchange failed, using short-lived:",
        error.message
      );
      longLivedToken = accessToken;
      tokenExpiresIn = expiresIn || 3600;
    }

    // Validate token
    const graphClient = createGraphAPIClient(longLivedToken);
    const tokenValidation = await graphClient.validateToken();

    if (!tokenValidation.isValid) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    console.log(
      "✅ [Login for Business API] Token validated, scopes:",
      tokenValidation.scopes
    );

    // CRITICAL: Validate business_management permission
    // This is the main purpose of this endpoint
    console.log(
      "🔍 [Login for Business API] Checking for business_management permission..."
    );

    const permissionsResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/permissions?access_token=${longLivedToken}`
    );

    let validatedPermissions: string[] = [];
    if (permissionsResponse.ok) {
      const permissionsData = await permissionsResponse.json();
      validatedPermissions =
        permissionsData.data
          ?.filter((p: any) => p.status === "granted")
          ?.map((p: any) => p.permission) || [];

      console.log(
        "✅ [Login for Business API] Granted permissions:",
        validatedPermissions
      );
      grantedPermissions = validatedPermissions;

      // REQUIRE business_management for this endpoint
      if (!validatedPermissions.includes("business_management")) {
        console.error(
          "❌ [Login for Business API] Missing business_management permission"
        );
        return NextResponse.json(
          {
            error: "Missing required permission: business_management",
            hint: "Please grant Business Manager access when prompted. This is required to list your businesses.",
            grantedPermissions: validatedPermissions,
          },
          { status: 403 }
        );
      }

      console.log(
        "✅ [Login for Business API] business_management permission verified"
      );
    } else {
      console.warn("⚠️ [Login for Business API] Could not verify permissions");
    }

    // Get user profile
    const profile = await graphClient.getUserProfile();

    // Calculate token expiration
    const expiresAt = new Date(
      Date.now() + tokenExpiresIn * 1000
    ).toISOString();

    // Encrypt token for storage
    const encryptedToken = encryptToken(longLivedToken);

    // Store or update Facebook account
    const existingAccount = await getFacebookAccountByUserId(user.id);

    let facebookAccount;
    if (existingAccount) {
      facebookAccount = await updateFacebookAccount(existingAccount.id, {
        access_token: encryptedToken,
        expires_at: expiresAt,
        granted_permissions: grantedPermissions || [],
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
        granted_permissions: grantedPermissions || [],
      });
    }

    // Fetch Business Managers
    console.log("🔍 [Login for Business API] Fetching Business Managers...");
    let businessManagers;
    try {
      businessManagers = await graphClient.getBusinessManagers();
      console.log(
        "✅ [Login for Business API] Found",
        businessManagers.length,
        "Business Managers"
      );
    } catch (error: any) {
      console.error(
        "❌ [Login for Business API] Failed to fetch Business Managers:",
        error.message
      );
      return NextResponse.json(
        {
          error: "Failed to fetch Business Managers",
          hint: "Ensure you have business_management permission and access to a Business Manager",
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (businessManagers.length === 0) {
      console.warn("⚠️ [Login for Business API] No Business Managers found");
      return NextResponse.json(
        {
          error: "No Business Managers found",
          hint: "Please create a Business Manager at business.facebook.com first",
          troubleshooting: [
            "Go to business.facebook.com and create a Business Manager",
            "Ensure your Facebook account is an admin of the Business Manager",
            "Try reconnecting after creating a Business Manager",
          ],
        },
        { status: 404 }
      );
    }

    // Store Business Managers
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
        // Get existing if duplicate
        const existing = await getBusinessManagersByUserId(user.id);
        const found = existing.find((b: any) => b.business_id === bm.id);
        if (found) {
          storedBusinessManagers.push(found);
        }
      }
    }

    console.log(
      "✅ [Login for Business API] Stored",
      storedBusinessManagers.length,
      "Business Managers"
    );

    return NextResponse.json({
      success: true,
      data: {
        facebookAccount: {
          ...facebookAccount,
          access_token: "[ENCRYPTED]",
        },
        businessManagers: storedBusinessManagers,
        summary: {
          step: 1,
          description: "Facebook Login for Business completed",
          businessManagersCount: storedBusinessManagers.length,
          nextStep: "Complete WhatsApp Embedded Signup (Step 2)",
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [Login for Business API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to complete Facebook Login for Business",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Check if user has completed Step 1 (has business_management access)
 */
export async function GET(request: NextRequest) {
  try {
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

    // Check for existing Facebook account with business_management
    const facebookAccount = await getFacebookAccountByUserId(user.id);

    if (!facebookAccount) {
      return NextResponse.json({
        hasBusinessAccess: false,
        step1Completed: false,
        businessManagers: [],
      });
    }

    // Check if business_management permission is present
    const hasBusinessManagement = facebookAccount.granted_permissions?.includes(
      "business_management"
    );

    // Get stored business managers
    const businessManagers = await getBusinessManagersByUserId(user.id);

    return NextResponse.json({
      hasBusinessAccess: hasBusinessManagement && businessManagers.length > 0,
      step1Completed: hasBusinessManagement && businessManagers.length > 0,
      businessManagers: businessManagers.map((bm: any) => ({
        id: bm.id,
        business_id: bm.business_id,
        business_name: bm.business_name,
      })),
      facebookAccount: {
        id: facebookAccount.id,
        facebook_user_name: facebookAccount.facebook_user_name,
        status: facebookAccount.status,
        granted_permissions: facebookAccount.granted_permissions,
      },
    });
  } catch (error: any) {
    console.error("Error checking business access:", error);
    return NextResponse.json(
      { error: "Failed to check business access", message: error.message },
      { status: 500 }
    );
  }
}
