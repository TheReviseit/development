/**
 * Session Verification Endpoint
 * ==============================
 * Production-grade endpoint for confirming session cookie propagation.
 *
 * Critical for eliminating auth-to-navigation race conditions.
 * Returns 200 ONLY when session cookie is confirmed readable server-side.
 *
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Timeout for Firebase Admin SDK cold starts (milliseconds)
  verificationTimeoutMs: 3000,
  // Cookie names to check (in order of priority)
  sessionCookieNames: ["session", "flowauxi_session"],
};

// =============================================================================
// TYPES
// =============================================================================

interface VerifySessionResponse {
  valid: boolean;
  userId?: string;
  email?: string;
  error?: string;
  errorCode?: string;
}

// =============================================================================
// TIMEOUT-PROTECTED VERIFICATION
// =============================================================================

/**
 * Verify session cookie with cold-start timeout protection.
 *
 * Firebase Admin SDK can hang during cold starts. This wrapper ensures
 * we never block the auth flow longer than CONFIG.verificationTimeoutMs.
 *
 * @param sessionCookie - The session cookie value
 * @returns Decoded claims or timeout error
 */
async function verifySessionWithTimeout(
  sessionCookie: string
): Promise<{
  success: boolean;
  data?: { uid: string; email?: string };
  error?: string;
  errorCode?: string;
}> {
  const verificationPromise = adminAuth
    .verifySessionCookie(sessionCookie, true) // checkRevoked: true
    .then((decodedClaims) => ({
      success: true as const,
      data: {
        uid: decodedClaims.uid,
        email: decodedClaims.email,
      },
    }))
    .catch((error) => ({
      success: false as const,
      error: error?.message || "Session verification failed",
      errorCode: error?.errorInfo?.code || error?.code || "auth/unknown-error",
    }));

  const timeoutPromise = new Promise<{
    success: false;
    error: string;
    errorCode: string;
  }>((_, reject) => {
    setTimeout(() => {
      reject({
        success: false as const,
        error: "Session verification timed out (Firebase Admin cold start)",
        errorCode: "auth/timeout",
      });
    }, CONFIG.verificationTimeoutMs);
  });

  try {
    // Race between verification and timeout
    const result = await Promise.race([verificationPromise, timeoutPromise]);
    return result;
  } catch (timeoutResult: any) {
    // Timeout occurred
    console.warn(
      `[VerifySession] Timeout after ${CONFIG.verificationTimeoutMs}ms - Firebase Admin cold start likely`
    );
    return timeoutResult;
  }
}

// =============================================================================
// SESSION COOKIE EXTRACTION
// =============================================================================

/**
 * Extract session cookie from request.
 * Checks both cookie types in priority order.
 *
 * @param cookieStore - Next.js cookie store
 * @returns Cookie value or null
 */
async function extractSessionCookie(
  cookieStore: ReturnType<typeof cookies>
): Promise<string | null> {
  const resolvedCookies = await cookieStore;

  for (const cookieName of CONFIG.sessionCookieNames) {
    const cookie = resolvedCookies.get(cookieName);
    if (cookie?.value) {
      return cookie.value;
    }
  }

  return null;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * GET /api/auth/verify-session
 *
 * Verifies that the session cookie is:
 * 1. Present in the request
 * 2. Valid according to Firebase Admin SDK
 * 3. Not expired or revoked
 *
 * Returns:
 * - 200: Session valid, navigation safe to proceed
 * - 401: No session cookie found
 * - 403: Session invalid/expired/revoked
 * - 504: Verification timeout (Firebase Admin cold start)
 *
 * CRITICAL: This endpoint must be called with credentials: 'include'
 * to ensure cookies are sent.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<VerifySessionResponse>> {
  const requestId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                   request.headers.get("x-real-ip") || 
                   "unknown";

  console.log(`[${requestId}] Session verification request from ${clientIp}`);

  // Record timing for observability
  const startTime = performance.now();

  try {
    // Extract session cookie
    const cookieStore = cookies();
    const sessionCookie = await extractSessionCookie(cookieStore);

    if (!sessionCookie) {
      console.log(`[${requestId}] No session cookie found`);
      return NextResponse.json(
        {
          valid: false,
          error: "No session cookie found",
          errorCode: "auth/no-session-cookie",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Request-Id": requestId,
          },
        }
      );
    }

    // Verify with timeout protection
    const verificationResult = await verifySessionWithTimeout(sessionCookie);

    const duration = Math.round(performance.now() - startTime);
    console.log(
      `[${requestId}] Verification completed in ${duration}ms - Success: ${verificationResult.success}`
    );

    if (!verificationResult.success) {
      // Determine appropriate status code
      let statusCode = 403;
      if (verificationResult.errorCode === "auth/timeout") {
        statusCode = 504; // Gateway Timeout
      } else if (verificationResult.errorCode === "auth/no-session-cookie") {
        statusCode = 401;
      }

      return NextResponse.json(
        {
          valid: false,
          error: verificationResult.error,
          errorCode: verificationResult.errorCode,
        },
        {
          status: statusCode,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Request-Id": requestId,
            "X-Verification-Duration": String(duration),
          },
        }
      );
    }

    // Success: session confirmed
    return NextResponse.json(
      {
        valid: true,
        userId: verificationResult.data!.uid,
        email: verificationResult.data!.email,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Request-Id": requestId,
          "X-Verification-Duration": String(duration),
        },
      }
    );
  } catch (error: any) {
    // Unexpected error
    const duration = Math.round(performance.now() - startTime);
    console.error(`[${requestId}] Unexpected error after ${duration}ms:`, error);

    return NextResponse.json(
      {
        valid: false,
        error: "Internal server error during session verification",
        errorCode: "internal/error",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Request-Id": requestId,
          "X-Verification-Duration": String(duration),
        },
      }
    );
  }
}

// =============================================================================
// CORS AND CACHE CONFIGURATION
// =============================================================================

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(): Promise<NextResponse> {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true",
        "Cache-Control": "no-store",
      },
    }
  );
}
