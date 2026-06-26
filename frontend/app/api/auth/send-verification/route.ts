import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyIdToken } from "@/lib/firebase-admin";
import { verifySessionCookieCached } from "@/lib/auth/session-verify-cache";
import { issueVerificationCodeForUser } from "@/lib/auth/issue-verification-code.server";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { getRequestContext } from "@/lib/auth-helpers";
import { withTimeout } from "@/lib/server/fetchWithTimeout";

async function resolveAuthorizedUserId(
  request: NextRequest,
  bodyUserId: string,
): Promise<{ userId: string } | { error: NextResponse }> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (bearerToken) {
    const verification = await withTimeout(
      verifyIdToken(bearerToken),
      3000,
      "FIREBASE_ID_TOKEN_VERIFY_TIMEOUT",
    );
    if (!verification.success || !verification.data?.uid) {
      return {
        error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    if (verification.data.uid !== bodyUserId) {
      return {
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { userId: verification.data.uid };
  }

  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  try {
    const verified = await verifySessionCookieCached(session.value);
    if (verified.uid !== bodyUserId) {
      return {
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { userId: verified.uid };
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid session" }, { status: 401 }),
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestContext = getRequestContext(request);
    const { userId, email } = await request.json();

    if (!userId || !email || typeof userId !== "string" || typeof email !== "string") {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 },
      );
    }

    const authResult = await resolveAuthorizedUserId(request, userId);
    if ("error" in authResult) {
      return authResult.error;
    }

    const ipLimit = await checkRateLimit({
      namespace: "verify:ip",
      key: requestContext.ip_address || "unknown",
      limitPerHour: 20,
    });
    if (!ipLimit.allowed) {
      const response = NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(ipLimit.retryAfterSeconds));
      return response;
    }

    const sendLimit = await checkRateLimit({
      namespace: "verify:send:uid",
      key: userId,
      limitPerHour: 5,
    });
    if (!sendLimit.allowed) {
      const response = NextResponse.json(
        { error: "Too many verification emails sent. Please try again later." },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(sendLimit.retryAfterSeconds));
      return response;
    }

    const { code, expiresAt, path } = await issueVerificationCodeForUser({ userId });

    try {
      const { sendEmail } = await import("@/lib/email/resend");
      const { generateEmailHtml } = await import("@/lib/email/email-templates");
      const emailHtml = generateEmailHtml("email-verification", { code });

      if (emailHtml) {
        const result = await sendEmail({
          to: email,
          subject: "Verify your Flowauxi account",
          html: emailHtml,
        });

        if (!result.success) {
          console.error("[send-verification] Failed to send email:", result.error);
          return NextResponse.json(
            { error: "Failed to send verification email" },
            { status: 500 },
          );
        }
      }
    } catch (emailError) {
      console.error("[send-verification] Email dispatch error:", emailError);
      return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 },
      );
    }

    console.info("[send-verification] Verification email sent", {
      userIdSuffix: userId.slice(-6),
      issuePath: path,
    });

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("[send-verification] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
