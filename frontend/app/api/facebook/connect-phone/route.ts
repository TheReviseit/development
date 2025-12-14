/**
 * Connect Phone Number API Route
 * Finalizes the connection of a specific phone number
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  getFacebookAccountByUserId,
  getPhoneNumberByPhoneNumberId,
  updatePhoneNumber,
  getWhatsAppAccountByWabaId,
} from "@/lib/supabase/facebook-whatsapp-queries";
import { createGraphAPIClient } from "@/lib/facebook/graph-api-client";
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
      true
    );
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { phoneNumberId, wabaId, isPrimary = true } = body;

    if (!phoneNumberId || !wabaId) {
      return NextResponse.json(
        { error: "Missing phoneNumberId or wabaId" },
        { status: 400 }
      );
    }

    // Get phone number record
    const phoneNumber = await getPhoneNumberByPhoneNumberId(phoneNumberId);
    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 }
      );
    }

    // Verify user owns this phone number
    if (phoneNumber.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized - phone number belongs to another user" },
        { status: 403 }
      );
    }

    // Get Facebook account
    const facebookAccount = await getFacebookAccountByUserId(user.id);
    if (!facebookAccount) {
      return NextResponse.json(
        { error: "Facebook account not connected" },
        { status: 400 }
      );
    }

    // Decrypt access token
    const accessToken = decryptToken(facebookAccount.access_token);

    // Subscribe to webhook (optional - you can do this via Meta dashboard too)
    try {
      const graphClient = createGraphAPIClient(accessToken);
      const verifyToken = decryptToken(phoneNumber.webhook_verify_token || "");

      await graphClient.subscribeToWebhook(
        wabaId,
        phoneNumber.webhook_url || "",
        verifyToken,
        ["messages"]
      );

      // Update phone number to mark webhook as verified
      await updatePhoneNumber(phoneNumber.id, {
        webhook_verified: true,
        is_active: true,
        is_primary: isPrimary,
      });
    } catch (error) {
      console.error("Webhook subscription error:", error);
      // Continue even if webhook fails - user can set it up manually
      await updatePhoneNumber(phoneNumber.id, {
        is_active: true,
        is_primary: isPrimary,
      });
    }

    // Get updated phone number and WABA
    const updatedPhoneNumber = await getPhoneNumberByPhoneNumberId(
      phoneNumberId
    );
    const whatsappAccount = await getWhatsAppAccountByWabaId(wabaId);

    return NextResponse.json({
      success: true,
      data: {
        phoneNumber: updatedPhoneNumber,
        whatsappAccount,
      },
    });
  } catch (error: any) {
    console.error("Error connecting phone number:", error);
    return NextResponse.json(
      {
        error: "Failed to connect phone number",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
