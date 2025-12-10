import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import {
  getUserByFirebaseUID,
  getBusinessByUserId,
  createOrUpdateWhatsAppConnection,
  getWhatsAppConnection,
} from "@/lib/supabase/queries";
import { encryptToken } from "@/lib/encryption/crypto";

export async function POST(request: NextRequest) {
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
    const body = await request.json();

    // Get user and business
    const user = await getUserByFirebaseUID(firebaseUID);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const business = await getBusinessByUserId(user.id);

    if (!business) {
      return NextResponse.json(
        { error: "Business not found. Complete step 1 first." },
        { status: 404 }
      );
    }

    // Encrypt the API token
    const encryptedToken = body.apiToken ? encryptToken(body.apiToken) : "";

    // Create or update WhatsApp connection
    const connection = await createOrUpdateWhatsAppConnection(business.id, {
      provider_type: body.providerType || "cloud_api",
      phone_number: body.phoneNumber || "",
      phone_number_id: body.phoneNumberId || "",
      business_id_meta: body.businessIdMeta || "",
      api_token: encryptedToken,
      default_sender_name: body.defaultSenderName || "",
      messaging_category: body.messagingCategory || "",
      status: "pending",
      test_number: body.testNumber || "",
    });

    // If timezone and language are provided (from step 3), save them to business
    if (body.timezone || body.language) {
      const { createOrUpdateBusiness } = await import("@/lib/supabase/queries");
      await createOrUpdateBusiness(user.id, {
        ...business,
        timezone: body.timezone || business.timezone,
        language: body.language || business.language,
      });
    }

    return NextResponse.json({ success: true, connection });
  } catch (error: any) {
    console.error("Error saving WhatsApp connection:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

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

    const business = await getBusinessByUserId(user.id);

    if (!business) {
      return NextResponse.json({ connection: null });
    }

    const connection = await getWhatsAppConnection(business.id);

    // Don't send the decrypted token to the client
    if (connection) {
      return NextResponse.json({
        connection: {
          ...connection,
          api_token: "[ENCRYPTED]",
        },
      });
    }

    return NextResponse.json({ connection: null });
  } catch (error: any) {
    console.error("Error fetching WhatsApp connection:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
