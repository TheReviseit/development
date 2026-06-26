import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service-client";
import { verifySessionCookieCached } from "@/lib/auth/session-verify-cache";
import { adminAuth } from "@/lib/firebase-admin";
import {
  isVerifyEmailRpcEnabled,
  VERIFICATION_CODE_RE,
} from "@/lib/auth/verification-code";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import { getRequestContext } from "@/lib/auth-helpers";
import {
  attachVerifyEmailHeaders,
  createVerifyCorrelationId,
  VerifyEmailServerTimer,
  VERIFY_EMAIL_CORRELATION_HEADER,
} from "@/lib/perf/verify-email";

const SUPABASE_RPC_TIMEOUT_MS = 5000;

function shouldFallbackToLegacyVerify(error: unknown): boolean {
  const msg = String((error as Error)?.message || error);
  const code = (error as { code?: string })?.code;
  return (
    code === "PGRST202" ||
    msg.includes("Could not find the function") ||
    msg.includes("schema cache") ||
    msg.includes("VERIFY_EMAIL_RPC_TIMEOUT") ||
    msg.includes("AbortError") ||
    msg.includes("aborted") ||
    msg.includes("timeout")
  );
}

export async function POST(request: NextRequest) {
  const correlationId = createVerifyCorrelationId(
    request.headers.get(VERIFY_EMAIL_CORRELATION_HEADER),
  );
  const timer = new VerifyEmailServerTimer(correlationId);
  const requestContext = getRequestContext(request);

  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");
    const authHeader = request.headers.get("authorization");

    const authStarted = Date.now();
    let userId: string;
    let sessionCacheHit = false;

    if (session?.value) {
      // Fast path: verified session cookie (existing users, repeat requests)
      try {
        const verified = await verifySessionCookieCached(session.value);
        userId = verified.uid;
        sessionCacheHit = verified.cacheHit;
      } catch (error) {
        console.error("[verify-email] Session verification error:", error);
        const response = NextResponse.json({ error: "Invalid session" }, { status: 401 });
        timer.record("auth", authStarted);
        return attachVerifyEmailHeaders(response, timer);
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      // Fast path for newly signed-up users: Firebase ID token (no session cookie yet)
      try {
        const idToken = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(idToken);
        userId = decoded.uid;
      } catch (error) {
        console.error("[verify-email] Token verification error:", error);
        const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        timer.record("auth", authStarted);
        return attachVerifyEmailHeaders(response, timer);
      }
    } else {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return attachVerifyEmailHeaders(response, timer);
    }
    timer.record("auth", authStarted);

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
      return attachVerifyEmailHeaders(response, timer);
    }

    const uidLimit = await checkRateLimit({
      namespace: "verify:verify:uid",
      key: userId,
      limitPerHour: 10,
    });
    if (!uidLimit.allowed) {
      const response = NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(uidLimit.retryAfterSeconds));
      return attachVerifyEmailHeaders(response, timer);
    }

    const { code } = await request.json().catch(() => ({}));
    const verificationCode = typeof code === "string" ? code.trim() : "";

    if (!VERIFICATION_CODE_RE.test(verificationCode)) {
      const response = NextResponse.json(
        { error: "Kindly enter a valid 6-digit verification code." },
        { status: 400 },
      );
      return attachVerifyEmailHeaders(response, timer);
    }

    const supabase = getSupabaseServiceClient({ timeoutMs: SUPABASE_RPC_TIMEOUT_MS });
    const rpcStarted = Date.now();

    if (isVerifyEmailRpcEnabled()) {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc("verify_email_code", {
            p_firebase_uid: userId,
            p_code: verificationCode,
            p_cache_hit: sessionCacheHit,
          }) as unknown as Promise<{ data: Record<string, unknown> | null; error: { message?: string; code?: string } | null }>,
          SUPABASE_RPC_TIMEOUT_MS,
          "VERIFY_EMAIL_RPC_TIMEOUT",
        );
        timer.record("supabase_rpc", rpcStarted);

        if (error) {
          if (shouldFallbackToLegacyVerify(error)) {
            console.warn("[verify-email] RPC unavailable; using legacy path:", {
              firebaseUidSuffix: userId.slice(-6),
              reason: error.message,
            });
          } else {
            console.error("[verify-email] RPC error:", timer.structuredLog({ error: error.message }));
            const response = NextResponse.json({ error: "Verification failed" }, { status: 500 });
            return attachVerifyEmailHeaders(response, timer);
          }
        } else {
          const payload = (data ?? {}) as Record<string, any>;
          console.info("[verify-email]", timer.structuredLog({
            outcome: payload.outcome ?? (payload.success ? "success" : "error"),
            sessionCacheHit,
            firebaseUidSuffix: userId.slice(-6),
          }));

          if (payload.success) {
            const response = NextResponse.json({
              success: true,
              message: payload.message ?? "Email verified successfully",
              alreadyVerified: Boolean(payload.already_verified),
              welcomeEmailDeferred: Boolean(payload.welcome_email_deferred),
            });
            return attachVerifyEmailHeaders(response, timer);
          }

          const status =
            payload.error?.includes("already been used") ? 409 :
            payload.outcome === "expired" ? 400 :
            400;

          const response = NextResponse.json(
            {
              error: payload.error ?? "Verification failed",
              attemptsRemaining: payload.attempts_remaining,
            },
            { status },
          );
          return attachVerifyEmailHeaders(response, timer);
        }
      } catch (rpcError: any) {
        timer.record("supabase_rpc", rpcStarted);
        if (!shouldFallbackToLegacyVerify(rpcError)) {
          throw rpcError;
        }
        console.warn("[verify-email] RPC failed; using legacy path:", {
          firebaseUidSuffix: userId.slice(-6),
          reason: String(rpcError?.message || rpcError),
        });
      }
    }

    // Legacy fallback when RPC is disabled, not deployed, or unavailable.
    const legacyResult = await legacyVerifyEmail({
      supabase,
      userId,
      verificationCode,
      sessionCacheHit,
    });
    timer.record("supabase_rpc", rpcStarted);
    return attachVerifyEmailHeaders(legacyResult.response, timer);
  } catch (error) {
    console.error("[verify-email] Unhandled error:", timer.structuredLog({ error: String(error) }));
    const response = NextResponse.json({ error: "Internal server error" }, { status: 500 });
    return attachVerifyEmailHeaders(response, timer);
  }
}

async function legacyVerifyEmail(params: {
  supabase: ReturnType<typeof getSupabaseServiceClient>;
  userId: string;
  verificationCode: string;
  sessionCacheHit: boolean;
}): Promise<{ response: NextResponse }> {
  const { supabase, userId, verificationCode } = params;
  const MAX_ATTEMPTS = 3;

  const { data: existingUser } = await supabase
    .from("users")
    .select("email_verified")
    .eq("firebase_uid", userId)
    .maybeSingle();

  if (existingUser?.email_verified) {
    return {
      response: NextResponse.json({
        success: true,
        message: "Email is already verified",
      }),
    };
  }

  const { data: verificationData, error: fetchError } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("user_id", userId)
    .eq("verified", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !verificationData) {
    return {
      response: NextResponse.json(
        { error: "The verification code is incorrect or expired." },
        { status: 400 },
      ),
    };
  }

  if (new Date() > new Date(verificationData.expires_at)) {
    await supabase
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id)
      .eq("verified", false);

    return {
      response: NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 },
      ),
    };
  }

  if (Number(verificationData.attempts ?? 0) >= MAX_ATTEMPTS) {
    return {
      response: NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 400 },
      ),
    };
  }

  if (verificationData.code !== verificationCode) {
    const nextAttempts = Number(verificationData.attempts ?? 0) + 1;
    await supabase
      .from("verification_codes")
      .update({
        attempts: nextAttempts,
        ...(nextAttempts >= MAX_ATTEMPTS ? { verified: true } : {}),
      })
      .eq("id", verificationData.id)
      .eq("verified", false);

    return {
      response: NextResponse.json(
        {
          error:
            nextAttempts >= MAX_ATTEMPTS
              ? "Too many failed attempts. Please request a new code."
              : "The verification code is incorrect. Please check the code and try again.",
          attemptsRemaining: Math.max(MAX_ATTEMPTS - nextAttempts, 0),
        },
        { status: 400 },
      ),
    };
  }

  const { data: verifiedCode, error: updateCodeError } = await supabase
    .from("verification_codes")
    .update({ verified: true })
    .eq("id", verificationData.id)
    .eq("verified", false)
    .select("id")
    .maybeSingle();

  if (updateCodeError || !verifiedCode) {
    return {
      response: NextResponse.json(
        { error: updateCodeError ? "Verification failed" : "This verification code has already been used." },
        { status: updateCodeError ? 500 : 409 },
      ),
    };
  }

  await supabase.from("users").update({ email_verified: true }).eq("firebase_uid", userId);

  void supabase
    .from("verification_codes")
    .delete()
    .eq("user_id", userId)
    .neq("id", verificationData.id);

  return {
    response: NextResponse.json({
      success: true,
      message: "Email verified successfully",
      welcomeEmailDeferred: true,
    }),
  };
}
