/**
 * Debug Token API Route
 *
 * Uses Meta's /debug_token endpoint to inspect a token's permissions and validity.
 * Useful for troubleshooting permission issues.
 *
 * GET - Check the current user's stored token
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { getFacebookAccountByUserId } from "@/lib/supabase/facebook-whatsapp-queries";
import { decryptToken } from "@/lib/encryption/crypto";

interface DebugTokenData {
  app_id: string;
  type: string;
  application: string;
  data_access_expires_at: number;
  expires_at: number;
  is_valid: boolean;
  scopes: string[];
  granular_scopes: Array<{
    scope: string;
    target_ids?: string[];
  }>;
  user_id: string;
  error?: {
    message: string;
    code: number;
    subcode?: number;
  };
}

interface DebugTokenResponse {
  data: DebugTokenData;
}

export async function GET(request: NextRequest) {
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

    // Get stored Facebook account
    const facebookAccount = await getFacebookAccountByUserId(user.id);

    if (!facebookAccount) {
      return NextResponse.json(
        {
          error: "No Facebook account connected",
          hint: "Complete Step 1 (Facebook Login for Business) first",
        },
        { status: 404 }
      );
    }

    // Decrypt stored token
    let accessToken: string;
    try {
      accessToken = decryptToken(facebookAccount.access_token);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to decrypt stored token",
          hint: "The token may be corrupted. Try reconnecting your Facebook account.",
        },
        { status: 500 }
      );
    }

    // Build app access token for debug_token endpoint
    const appAccessToken = `${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

    // Call Meta's debug_token endpoint
    console.log("🔍 [Debug Token] Calling Meta debug_token endpoint...");

    const debugUrl = new URL("https://graph.facebook.com/v21.0/debug_token");
    debugUrl.searchParams.append("input_token", accessToken);
    debugUrl.searchParams.append("access_token", appAccessToken);

    const response = await fetch(debugUrl.toString());
    const debugData: DebugTokenResponse = await response.json();

    if (!response.ok || debugData.data?.error) {
      console.error("❌ [Debug Token] Error from Meta:", debugData);
      return NextResponse.json(
        {
          error: "Token debug failed",
          metaError: debugData.data?.error || debugData,
          hint: "The stored token may be invalid or expired. Try reconnecting.",
        },
        { status: 400 }
      );
    }

    console.log("✅ [Debug Token] Token debug successful");

    // Build response with token analysis
    const tokenData = debugData.data;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokenData.expires_at ? tokenData.expires_at - now : null;

    // Categorize permissions by flow
    const step1Permissions = ["business_management", "public_profile", "email"];
    const step2Permissions = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ];

    const grantedStep1 = step1Permissions.filter((p) =>
      tokenData.scopes.includes(p)
    );
    const grantedStep2 = step2Permissions.filter((p) =>
      tokenData.scopes.includes(p)
    );
    const missingStep1 = step1Permissions.filter(
      (p) => !tokenData.scopes.includes(p)
    );
    const missingStep2 = step2Permissions.filter(
      (p) => !tokenData.scopes.includes(p)
    );

    return NextResponse.json({
      success: true,
      data: {
        token: {
          isValid: tokenData.is_valid,
          type: tokenData.type,
          appId: tokenData.app_id,
          userId: tokenData.user_id,
          expiresAt: tokenData.expires_at
            ? new Date(tokenData.expires_at * 1000).toISOString()
            : null,
          expiresIn: expiresIn
            ? `${Math.round(expiresIn / 86400)} days`
            : "Never",
          dataAccessExpiresAt: tokenData.data_access_expires_at
            ? new Date(tokenData.data_access_expires_at * 1000).toISOString()
            : null,
        },
        permissions: {
          all: tokenData.scopes,
          step1: {
            granted: grantedStep1,
            missing: missingStep1,
            complete: missingStep1.length === 0,
          },
          step2: {
            granted: grantedStep2,
            missing: missingStep2,
            complete: missingStep2.length === 0,
          },
          granular: tokenData.granular_scopes,
        },
        analysis: {
          step1Complete: grantedStep1.includes("business_management"),
          step2Complete: grantedStep2.includes("whatsapp_business_management"),
          canFetchBusinessManagers: grantedStep1.includes(
            "business_management"
          ),
          canAccessWhatsApp: grantedStep2.includes(
            "whatsapp_business_management"
          ),
          canSendMessages: grantedStep2.includes("whatsapp_business_messaging"),
        },
        storedAccount: {
          id: facebookAccount.id,
          facebookUserId: facebookAccount.facebook_user_id,
          facebookUserName: facebookAccount.facebook_user_name,
          status: facebookAccount.status,
          storedPermissions: facebookAccount.granted_permissions,
          connectedAt: facebookAccount.connected_at,
          expiresAt: facebookAccount.expires_at,
        },
      },
    });
  } catch (error: any) {
    console.error("❌ [Debug Token] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to debug token",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
