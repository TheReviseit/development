import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyIdToken, adminAuth } from "@/lib/firebase-admin";
import {
  detectProductFromRequest,
  getRequestContext,
  getSelfServiceProducts,
  getStarterPlanSlug,
} from "@/lib/auth-helpers";
import {
  createSupabaseServiceClientOrThrow,
  ensureSupabaseUserAndMembershipFull,
} from "@/lib/auth/provisioning.server";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import { checkRateLimit } from "@/lib/server/rateLimit";
import {
  claimAuthSyncIdempotency,
  completeAuthSyncIdempotency,
  generateAuthSyncIdempotencyKey,
  waitForAuthSyncCompletion,
} from "@/lib/auth/authSyncIdempotency";
import {
  AuthErrorCode,
  type ProductDomain,
  type SupabaseUser,
  type SyncUserRequest,
  type SyncUserResponse,
} from "@/types/auth.types";
import { trace as otelTrace } from "@opentelemetry/api";

type SyncResult = {
  status: number;
  body: SyncUserResponse;
  clearSession?: boolean;
  setCookieIfAuthenticated?: boolean;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestContext = getRequestContext(request);
  const traceparent = request.headers.get("traceparent") || null;
  const traceId =
    otelTrace.getActiveSpan()?.spanContext().traceId ||
    (traceparent ? traceparent.split("-")[1] : undefined);

  const lockOwnerId = crypto.randomUUID();

  const buildResponse = async (params: {
    result: SyncResult;
    idempotencyKey?: string;
    hasValidSessionCookie: boolean;
    idToken: string;
  }) => {
    const { result, idempotencyKey, hasValidSessionCookie, idToken } = params;

    const response = NextResponse.json<SyncUserResponse>(result.body, {
      status: result.status,
    });

    response.headers.set("x-request-id", requestContext.request_id);
    if (traceparent) response.headers.set("traceparent", traceparent);
    if (idempotencyKey) response.headers.set("x-idempotency-key", idempotencyKey);

    if (result.clearSession) {
      response.cookies.delete("session");
    }

    if (result.setCookieIfAuthenticated && !hasValidSessionCookie) {
      try {
        const expiresInMs = 60 * 60 * 24 * 5 * 1000;
        const sessionCookie = await withTimeout(
          adminAuth.createSessionCookie(idToken, { expiresIn: expiresInMs }),
          5000,
          "FIREBASE_CREATE_SESSION_COOKIE_TIMEOUT",
        );

        const cookieStore = await cookies();
        cookieStore.set("session", sessionCookie, {
          maxAge: 60 * 60 * 24 * 5,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          sameSite: "lax",
        });
      } catch (cookieError) {
        console.error(`[AUTH_SYNC] Failed to create session cookie:`, cookieError);
      }
    }

    return response;
  };

  try {
    const body: SyncUserRequest = await request.json().catch(() => ({} as any));
    const idToken = body?.idToken;
    const allowCreate = body?.allowCreate === true;

    const currentProduct: ProductDomain = detectProductFromRequest(request);

    console.log(
      `[AUTH_SYNC] Request started - product=${currentProduct}, allowCreate=${allowCreate}, request_id=${requestContext.request_id}`,
    );

    // ----------------------------------------------------------------------
    // Rate limit: per-IP (before token verification)
    // ----------------------------------------------------------------------
    const ipKey = requestContext.ip_address || "unknown";
    const ipLimit = await checkRateLimit({
      namespace: "authsync:ip",
      key: ipKey,
      limitPerMinute: 60,
    });
    if (!ipLimit.allowed) {
      const response = NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Too many requests",
          code: AuthErrorCode.RATE_LIMIT_EXCEEDED,
          requestId: requestContext.request_id,
          traceId,
        },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(ipLimit.retryAfterSeconds));
      response.headers.set("x-request-id", requestContext.request_id);
      return response;
    }

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Missing idToken in request body",
          code: AuthErrorCode.MISSING_REQUIRED_FIELD,
          requestId: requestContext.request_id,
          traceId,
        },
        { status: 400 },
      );
    }

    // ----------------------------------------------------------------------
    // Verify Firebase token
    // ----------------------------------------------------------------------
    const verificationResult = await withTimeout(
      verifyIdToken(idToken),
      5000,
      "FIREBASE_ID_TOKEN_VERIFY_TIMEOUT",
    );

    if (!verificationResult.success || !verificationResult.data) {
      return NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Invalid or expired Firebase token",
          code: AuthErrorCode.INVALID_TOKEN,
          requestId: requestContext.request_id,
          traceId,
        },
        { status: 401 },
      );
    }

    const decodedToken = verificationResult.data as any;
    const firebaseUid: string = decodedToken.uid;
    const email: string = decodedToken.email || "";
    const phoneNumber: string | null = decodedToken.phone_number || null;
    const fullName: string = decodedToken.name || email.split("@")[0] || "User";
    const tokenIat: number = typeof decodedToken.iat === "number" ? decodedToken.iat : 0;

    // ----------------------------------------------------------------------
    // Rate limit: per-user (after token verification)
    // ----------------------------------------------------------------------
    const uidLimit = await checkRateLimit({
      namespace: "authsync:uid",
      key: firebaseUid,
      limitPerMinute: 20,
    });
    if (!uidLimit.allowed) {
      const response = NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Too many requests",
          code: AuthErrorCode.RATE_LIMIT_EXCEEDED,
          requestId: requestContext.request_id,
          traceId,
        },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(uidLimit.retryAfterSeconds));
      response.headers.set("x-request-id", requestContext.request_id);
      return response;
    }

    // ----------------------------------------------------------------------
    // Session cookie reuse / mismatch clearing (identity safety)
    // ----------------------------------------------------------------------
    let hasValidSessionCookie = false;
    try {
      const cookieStore = await cookies();
      const existingSession = cookieStore.get("session");
      if (existingSession?.value) {
        try {
          const decodedSession = await withTimeout(
            adminAuth.verifySessionCookie(existingSession.value, false),
            5000,
            "FIREBASE_VERIFY_SESSION_COOKIE_TIMEOUT",
          );

          const sessionUid = decodedSession.uid;
          if (sessionUid === firebaseUid) {
            hasValidSessionCookie = true;
          } else {
            cookieStore.delete("session");
            hasValidSessionCookie = false;
          }
        } catch {
          cookieStore.delete("session");
        }
      }
    } catch {
      // Cookie verification is best-effort.
    }

    // ----------------------------------------------------------------------
    // Supabase service client
    // ----------------------------------------------------------------------
    const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });

    // ----------------------------------------------------------------------
    // Idempotency (lock-safe claim-first)
    // ----------------------------------------------------------------------
    const idempotencyKey = generateAuthSyncIdempotencyKey({
      firebaseUid,
      product: currentProduct,
      allowCreate,
      tokenIat,
    });

    const claim = await claimAuthSyncIdempotency({
      supabase,
      idempotencyKey,
      lockedBy: lockOwnerId,
      ttlSeconds: 300,
    });

    if (!claim) {
      return NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Idempotency unavailable",
          code: AuthErrorCode.SERVER_ERROR,
          requestId: requestContext.request_id,
          idempotencyKey,
          traceId,
        },
        { status: 500 },
      );
    }

    const respondFromCached = async (cached: {
      statusCode: number;
      responseBody: any;
    }) => {
      const body = (cached.responseBody ?? {}) as SyncUserResponse;
      const result: SyncResult = {
        status: cached.statusCode,
        body: {
          ...body,
          requestId: body.requestId ?? requestContext.request_id,
          idempotencyKey,
          traceId: (body as any)?.traceId ?? traceId,
        },
        clearSession:
          (body as any)?.code === "USER_NOT_FOUND" ||
          (body as any)?.code === "INVALID_TOKEN" ||
          (body as any)?.code === "TOKEN_VERIFICATION_FAILED",
        setCookieIfAuthenticated: Boolean((body as any)?.success),
      };

      return await buildResponse({
        result,
        idempotencyKey,
        hasValidSessionCookie,
        idToken,
      });
    };

    if (!claim.claimed) {
      if ((claim.status === "completed" || claim.status === "failed") && claim.status_code != null) {
        return await respondFromCached({
          statusCode: claim.status_code,
          responseBody: claim.response_body,
        });
      }

      if (claim.status === "processing") {
        const waited = await waitForAuthSyncCompletion({
          supabase,
          idempotencyKey,
          timeoutMs: 5000,
          pollMs: 250,
        });

        if (waited.done) {
          return await respondFromCached({
            statusCode: waited.statusCode,
            responseBody: waited.responseBody,
          });
        }

        const inProgress: SyncResult = {
          status: 202,
          body: {
            success: false,
            error: "Sync in progress",
            code: AuthErrorCode.SYNC_IN_PROGRESS,
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          },
        };

        const response = await buildResponse({
          result: inProgress,
          idempotencyKey,
          hasValidSessionCookie,
          idToken,
        });
        response.headers.set("Retry-After", "1");
        return response;
      }

      return NextResponse.json<SyncUserResponse>(
        {
          success: false,
          error: "Idempotency conflict",
          code: AuthErrorCode.SERVER_ERROR,
          requestId: requestContext.request_id,
          idempotencyKey,
          traceId,
        },
        { status: 500 },
      );
    }

    // ----------------------------------------------------------------------
    // Owner: provisioning (single RPC) + access decision
    // ----------------------------------------------------------------------
    let result: SyncResult;
    try {
      const provisioned = await ensureSupabaseUserAndMembershipFull({
        supabase,
        firebaseUid,
        email,
        fullName,
        phoneNumber,
        currentProduct,
        allowCreate,
        requestContext,
        allowLegacyMigration: true,
      });

      const user = provisioned.user as SupabaseUser;
      const selfServiceProducts = getSelfServiceProducts();
      const isSelfService = selfServiceProducts.includes(currentProduct);

      // Durable async jobs (best-effort, owner only)
      if (provisioned.created) {
        try {
          const jobs: Array<{ type: string; payload: Record<string, unknown> }> = [];
          const isWelcomeEmailEnabled = process.env.ENABLE_WELCOME_EMAIL !== "false";

          if (isWelcomeEmailEnabled && email) {
            jobs.push({
              type: "SEND_WELCOME_EMAIL",
              payload: {
                email,
                full_name: fullName,
                product: currentProduct,
              },
            });
          }

          if (allowCreate && isSelfService) {
            jobs.push({
              type: "START_TRIAL",
              payload: {
                user_id: user.id,
                org_id: user.id,
                email,
                domain: currentProduct,
                product: currentProduct,
                plan_slug: getStarterPlanSlug(currentProduct),
                idempotency_key: idempotencyKey,
                ip_address: requestContext.ip_address,
                user_agent: requestContext.user_agent,
              },
            });
          }

          if (jobs.length > 0) {
            const rows = jobs.map((j) => ({
              type: j.type,
              payload: j.payload,
              status: "pending",
              attempts: 0,
              max_attempts: 3,
              next_attempt_at: new Date().toISOString(),
              traceparent,
              request_id: requestContext.request_id,
            }));
            const { error: jobError } = await supabase
              .from("background_jobs")
              .insert(rows as any);
            if (jobError) {
              console.warn("[AUTH_SYNC] Failed to enqueue background jobs (non-fatal):", jobError);
            }
          }
        } catch (jobErr) {
          console.warn("[AUTH_SYNC] Background job enqueue failed (non-fatal):", jobErr);
        }
      }

      if (!provisioned.hasAccess) {
        const { data: userMemberships } = await supabase
          .from("user_products")
          .select("product")
          .eq("user_id", user.id)
          .in("status", ["trial", "active"]);

        const availableProducts: ProductDomain[] = getSelfServiceProducts().filter(
          (p) => !userMemberships?.some((m: any) => m.product === p),
        ) as ProductDomain[];

        result = {
          status: 403,
          body: {
            success: false,
            code: AuthErrorCode.PRODUCT_NOT_ENABLED,
            message: `Activate ${currentProduct} to continue`,
            currentProduct,
            availableProducts,
            action: allowCreate ? "AUTO_PROVISION_AVAILABLE" : "ACTIVATION_REQUIRED",
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          },
        };
      } else {
        result = {
          status: 200,
          body: {
            success: true,
            user,
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          },
          setCookieIfAuthenticated: true,
        };
      }
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      const looksLikeTimeout =
        errMsg.includes("AbortError") || errMsg.includes("aborted") || errMsg.includes("timeout");

      if (e?.code === "USER_NOT_FOUND" || errMsg === "USER_NOT_FOUND") {
        result = {
          status: 404,
          clearSession: true,
          body: {
            success: false,
            error: "User account not found in database",
            code: AuthErrorCode.USER_NOT_FOUND,
            message:
              "Your account was not fully created. Please sign up again to complete setup.",
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          },
        };
      } else if (looksLikeTimeout) {
        result = {
          status: 504,
          body: {
            success: false,
            error: "Upstream timeout",
            code: AuthErrorCode.UPSTREAM_TIMEOUT,
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          },
        };
      } else {
        console.error(`[AUTH_SYNC] Provisioning error:`, e);
        result = {
          status: 500,
          body: {
            success: false,
            error: "Database error",
            code: AuthErrorCode.DATABASE_ERROR,
            details: e?.message,
            requestId: requestContext.request_id,
            idempotencyKey,
            traceId,
          } as any,
        };
      }
    }

    // Complete idempotency cache (owner only)
    try {
      await completeAuthSyncIdempotency({
        supabase,
        idempotencyKey,
        lockedBy: lockOwnerId,
        status: "completed",
        statusCode: result.status,
        responseBody: result.body,
        errorCode: (result.body.code as any) ?? null,
      });
    } catch (cacheErr) {
      console.warn("[AUTH_SYNC] Failed to finalize idempotency (non-fatal):", cacheErr);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[AUTH_SYNC] Completed - elapsed=${elapsedMs}ms, firebase_uid=${firebaseUid}, product=${currentProduct}, status=${result.status}`,
    );

    return await buildResponse({
      result,
      idempotencyKey,
      hasValidSessionCookie,
      idToken,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`[AUTH_SYNC] Unhandled error - elapsed=${elapsedMs}ms:`, error);

    return NextResponse.json<SyncUserResponse>(
      {
        success: false,
        error: "Internal server error",
        code: AuthErrorCode.SERVER_ERROR,
        details: error?.message,
        requestId: requestContext.request_id,
        traceId,
      } as any,
      { status: 500 },
    );
  }
}
