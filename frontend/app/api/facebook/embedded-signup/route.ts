/**
 * WhatsApp Embedded Signup API Route
 */

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import {
  handleEmbeddedSignupWithConnectionEngineV2,
  isWhatsAppConnectionEngineV2Enabled,
} from "@/lib/whatsapp-connection/application/legacy-embedded-signup-adapter";
import {
  createEmbeddedSignupCorrelationId,
  EmbeddedSignupServerTimer,
  jsonWithEmbeddedSignupPerf,
} from "@/lib/perf/embedded-signup";
import { handleLegacyEmbeddedSignup } from "@/lib/facebook/embedded-signup-legacy-handler";

export async function POST(request: NextRequest) {
  const correlationId = createEmbeddedSignupCorrelationId(
    request.headers.get("X-Correlation-ID"),
  );
  const timer = new EmbeddedSignupServerTimer(correlationId);
  const authStart = Date.now();

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      timer.record("auth", authStart);
      return jsonWithEmbeddedSignupPerf({ error: "Unauthorized" }, timer, {
        status: 401,
      });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    const user = await getUserByFirebaseUID(decodedClaims.uid);
    timer.record("auth", authStart);

    if (!user) {
      return jsonWithEmbeddedSignupPerf({ error: "User not found" }, timer, {
        status: 404,
      });
    }

    const body = await request.json();

    if (isWhatsAppConnectionEngineV2Enabled()) {
      return await handleEmbeddedSignupWithConnectionEngineV2({
        request,
        body,
        timer,
      });
    }

    return await handleLegacyEmbeddedSignup({ user, body, timer });
  } catch (error: any) {
    console.error("❌ [Embedded Signup API] Error:", error);
    return jsonWithEmbeddedSignupPerf(
      {
        error: "Failed to complete embedded signup",
        message: error.message || "Unknown error",
      },
      timer,
      { status: 500 },
    );
  }
}
