/**
 * WhatsApp connection health — webhook subscribe status after embedded signup.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { getWebhookStatusForWaba } from "@/lib/whatsapp/webhook-subscribe-jobs";

export async function GET(request: NextRequest) {
  try {
    const wabaId = request.nextUrl.searchParams.get("wabaId");
    if (!wabaId) {
      return NextResponse.json({ error: "wabaId is required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    const user = await getUserByFirebaseUID(decodedClaims.uid);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const webhookStatus = await getWebhookStatusForWaba(user.id, wabaId);
    return NextResponse.json({
      wabaId,
      webhookStatus: webhookStatus ?? "pending",
      ready: webhookStatus === "active",
    });
  } catch (error: any) {
    console.error("[connection-health] error", error);
    return NextResponse.json(
      { error: "Failed to fetch connection health" },
      { status: 500 },
    );
  }
}
