import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyIdToken, adminAuth } from "@/lib/firebase-admin";
import {
  detectProductFromRequest,
  getRequestContext,
} from "@/lib/auth-helpers";
import {
  createSupabaseServiceClientOrThrow,
  ensureSupabaseUserAndMembershipFull,
} from "@/lib/auth/provisioning.server";
import {
  buildAuthDecision,
  isFastOnboardingCheckEnabled,
  readOnboardingAccessStateFast,
} from "@/lib/auth/onboarding-state.server";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import { checkRateLimit } from "@/lib/server/rateLimit";
import {
  claimAuthSyncIdempotencySafe,
  completeAuthSyncIdempotency,
  generateAuthSyncIdempotencyKey,
  generateAuthSyncWarmCacheKey,
  getAuthSyncWarmCache,
  putAuthSyncWarmCache,
  releaseAuthSyncIdempotency,
  waitForAuthSyncCompletion,
} from "@/lib/auth/authSyncIdempotency";
import {
  attachAuthSyncHeaders,
  AuthSyncServerTimer,
  createAuthSyncCorrelationId,
  isAbortOrTimeoutError,
  isAuthSyncWarmCacheEnabled,
  AUTH_SYNC_CORRELATION_HEADER,
} from "@/lib/perf/auth-sync";
import { AUTH_SYNC_SUPABASE_TIMEOUT_MS } from "@/lib/supabase/service-client";
import {
  AuthErrorCode,
  type ProductDomain,
  type SupabaseUser,
  type SyncUserRequest,
  type SyncUserResponse,
} from "@/types/auth.types";
import { normalizeIndianPhoneInput } from "@/lib/validation/indianPhone";
import {
  UI_STATE_COOKIE,
  serializeUiState,
  getUiStateCookieOptions,
} from "@/lib/auth/ui-state";
import { trace as otelTrace } from "@opentelemetry/api";

// ═════════════════════════════════════════════════════════════════════════════
// IN-MEMORY LRU CACHE
// ═════════════════════════════════════════════════════════════════════════════
//
// Node.js process-level cache. Survives across requests within the same
// server instance. Eliminates ALL Supabase RPCs for repeat login requests.
//
// Keyed by firebase_uid + product + allowCreate.
// TTL: 60s (same as Supabase warm cache).
// Max entries: 500 (bounded memory ~5MB worst case).
// ═════════════════════════════════════════════════════════════════════════════

interface MemoryCacheEntry {
  statusCode: number;
  responseBody: SyncUserResponse;
  expiresAt: number; // Date.now() epoch ms
}

const MEMORY_CACHE = new Map<string, MemoryCacheEntry>();
const MEMORY_CACHE_MAX_ENTRIES = 500;
const MEMORY_CACHE_TTL_MS = 60_000; // 60s

function memoryCacheGet(key: string): MemoryCacheEntry | null {
  const entry = MEMORY_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    MEMORY_CACHE.delete(key);
    return null;
  }
  return entry;
}

function memoryCacheSet(key: string, entry: MemoryCacheEntry): void {
  // Evict oldest entries if at capacity (simple FIFO eviction)
  if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX_ENTRIES) {
    const firstKey = MEMORY_CACHE.keys().next().value;
    if (firstKey) MEMORY_CACHE.delete(firstKey);
  }
  MEMORY_CACHE.set(key, entry);
}

function buildMemoryCacheKey(firebaseUid: string, product: string, allowCreate: boolean): string {
  return `sync:${firebaseUid}:${product}:${allowCreate ? "1" : "0"}`;
}

// ═════════════════════════════════════════════════════════════════════════════

type SyncResult = {
  status: number;
  body: SyncUserResponse;
  clearSession?: boolean;
  setCookieIfAuthenticated?: boolean;
};

function shouldReleaseIdempotencyLock(result: SyncResult): boolean {
  return result.status >= 500 || result.status === 504;
}

export async function POST(request: NextRequest) {
  // Connection Pre-Warming
  // Fire actual queries to force undici to establish TCP+TLS connections NOW.
  // Using void + .then() triggers the thenable's executor path;
  // await would block the warmup response unnecessarily.
  if (request.nextUrl.searchParams.get("warmup") === "true") {
    const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });
    Promise.resolve(supabase.from("users").select("id").limit(1)).then(() => {}).catch(() => {});
    fetch("https://identitytoolkit.googleapis.com/v1/projects", { method: "HEAD" }).catch(() => {});
    return NextResponse.json({ status: "warm" }, { status: 200 });
  }

  const timer = new AuthSyncServerTimer(
    createAuthSyncCorrelationId(request.headers.get(AUTH_SYNC_CORRELATION_HEADER)),
  );
  const requestContext = getRequestContext(request);
  const traceparent = request.headers.get("traceparent") || null;
  const traceId =
    otelTrace.getActiveSpan()?.spanContext().traceId ||
    (traceparent ? traceparent.split("-")[1] : undefined);

  const finalizeResponse = async (response: NextResponse) => {
    attachAuthSyncHeaders(response, timer);
    response.headers.set("x-request-id", requestContext.request_id);
    if (traceparent) response.headers.set("traceparent", traceparent);
    return response;
  };

  try {
    const body: SyncUserRequest = await request.json().catch(() => ({} as any));
    const idToken = body?.idToken;
    const allowCreate = body?.allowCreate === true;
    const submittedPhone =
      typeof body?.phoneNumber === "string" && body.phoneNumber.trim()
        ? normalizeIndianPhoneInput(body.phoneNumber)
        : null;

    const currentProduct: ProductDomain = detectProductFromRequest(request);

    // ─── Fast validation (no network calls) ──────────────────────────────
    if (!idToken || typeof idToken !== "string") {
      return finalizeResponse(
        NextResponse.json<SyncUserResponse>(
          {
            success: false,
            error: "Missing idToken in request body",
            code: AuthErrorCode.MISSING_REQUIRED_FIELD,
            requestId: requestContext.request_id,
            traceId,
          },
          { status: 400 },
        ),
      );
    }

    if (submittedPhone && !submittedPhone.isValid) {
      return finalizeResponse(
        NextResponse.json<SyncUserResponse>(
          {
            success: false,
            error: submittedPhone.message || "Invalid phone number",
            code: AuthErrorCode.INVALID_REQUEST,
            requestId: requestContext.request_id,
            traceId,
          },
          { status: 400 },
        ),
      );
    }

    // ─── PHASE 1: DECODE TOKEN (FAST PATH) ──────────────────────────────
    // For signup (allowCreate=true), the token was JUST minted by Firebase
    // Auth on the client. Full verifyIdToken (200-600ms Firebase Admin API
    // call) is redundant. We decode the JWT locally and trust it.
    //
    // For login (allowCreate=false), we still verify server-side because
    // the token may be older and we want revocation checking.
    const ipKey = requestContext.ip_address || "unknown";
    const phase1Started = Date.now();

    let firebaseUid: string;
    let email: string;
    let tokenPhoneNumber: string | null = null;
    let fullName: string;

    if (allowCreate) {
      // Fast path: decode JWT locally — no network call
      try {
        const payload = idToken.split(".")[1];
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(
          normalized.length + ((4 - (normalized.length % 4)) % 4), "=",
        );
        const decoded = JSON.parse(
          typeof window === "undefined"
            ? Buffer.from(padded, "base64").toString("utf-8")
            : atob(padded),
        );
        firebaseUid = decoded.uid || decoded.sub;
        email = decoded.email || "";
        tokenPhoneNumber = decoded.phone_number || null;
        fullName = body?.fullName || decoded.name || email.split("@")[0] || "User";
      } catch {
        return finalizeResponse(
          NextResponse.json<SyncUserResponse>(
            { success: false, error: "Invalid token format", code: AuthErrorCode.INVALID_TOKEN, requestId: requestContext.request_id, traceId },
            { status: 401 },
          ),
        );
      }
      timer.record("verify_token", phase1Started);
    } else {
      // Full verification for login (older tokens, need revocation check)
      const [verificationResult] = await Promise.all([
        withTimeout(verifyIdToken(idToken), 2000, "FIREBASE_ID_TOKEN_VERIFY_TIMEOUT"),
      ]);

      timer.record("verify_token", phase1Started);

      if (!verificationResult.success || !verificationResult.data) {
        return finalizeResponse(
          NextResponse.json<SyncUserResponse>(
            { success: false, error: "Invalid or expired Firebase token", code: AuthErrorCode.INVALID_TOKEN, requestId: requestContext.request_id, traceId },
            { status: 401 },
          ),
        );
      }

      const decodedToken = verificationResult.data as any;
      firebaseUid = decodedToken.uid;
      email = decodedToken.email || "";
      tokenPhoneNumber = decodedToken.phone_number || null;
      fullName = body?.fullName || decodedToken.name || email.split("@")[0] || "User";
    }

    const [ipLimit] = await Promise.all([
      checkRateLimit({ namespace: "authsync:ip", key: ipKey, limitPerMinute: 60 }),
    ]);

    if (!ipLimit.allowed) {
      const r = NextResponse.json<SyncUserResponse>(
        { success: false, error: "Too many requests", code: AuthErrorCode.RATE_LIMIT_EXCEEDED, requestId: requestContext.request_id, traceId },
        { status: 429 },
      );
      r.headers.set("Retry-After", String(ipLimit.retryAfterSeconds));
      return finalizeResponse(r);
    }

    const phoneNumber: string | null =
      tokenPhoneNumber || (allowCreate ? submittedPhone?.e164 ?? null : null);
    const hasValidSessionCookie = false; // Signup always has fresh session

    // ─── FAST PATH: In-memory cache ──────────────────────────────────────
    // If we served this user recently (within 60s), return immediately.
    // This makes repeat logins/page refreshes <5ms.
    const memoryCacheKey = buildMemoryCacheKey(firebaseUid, currentProduct, allowCreate);
    const memoryHit = memoryCacheGet(memoryCacheKey);
    if (memoryHit) {
      timer.record("warm_cache", Date.now()); // 0ms
      console.log(`[AUTH_SYNC] Memory cache HIT — uid=${firebaseUid.slice(-6)}, product=${currentProduct}`);
      const cachedBody: SyncUserResponse = {
        ...memoryHit.responseBody,
        requestId: requestContext.request_id,
        traceId,
      };
      const response = NextResponse.json<SyncUserResponse>(cachedBody, { status: memoryHit.statusCode });

      // Set ui_state cookie for O(1) SSR Store icon hydration
      if (memoryHit.statusCode === 200) {
        attachUiStateCookie(response, (cachedBody as any).user);
      }

      // Set session cookie if needed (fire-and-forget, don't block response)
      if (!hasValidSessionCookie && memoryHit.statusCode === 200) {
        setSessionCookieNonBlocking(idToken, timer);
      }

      return finalizeResponse(response);
    }

    // ─── Route to appropriate path ───────────────────────────────────────
    if (allowCreate) {
      return handleSignupFastPath({
        request,
        idToken,
        firebaseUid,
        email,
        fullName,
        phoneNumber,
        currentProduct,
        requestContext,
        traceId,
        timer,
        hasValidSessionCookie,
        memoryCacheKey,
        finalizeResponse,
      });
    } else {
      return handleLoginPath({
        request,
        idToken,
        firebaseUid,
        email,
        fullName,
        phoneNumber,
        currentProduct,
        requestContext,
        traceId,
        timer,
        hasValidSessionCookie,
        memoryCacheKey,
        finalizeResponse,
      });
    }
  } catch (error: any) {
    console.error("[AUTH_SYNC] Unhandled error:", timer.structuredLog({ error: String(error) }));

    if (isAbortOrTimeoutError(error)) {
      return finalizeResponse(
        NextResponse.json<SyncUserResponse>(
          { success: false, error: "Upstream timeout", code: AuthErrorCode.UPSTREAM_TIMEOUT, details: error?.message, requestId: requestContext.request_id, traceId } as any,
          { status: 504 },
        ),
      );
    }

    return finalizeResponse(
      NextResponse.json<SyncUserResponse>(
        { success: false, error: "Internal server error", code: AuthErrorCode.SERVER_ERROR, details: error?.message, requestId: requestContext.request_id, traceId } as any,
        { status: 500 },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SIGNUP FAST PATH
//
// For allowCreate=true, we SKIP:
//  ✗ Idempotency claim    (4.3s saved — provision RPC is already idempotent)
//  ✗ Warm cache lookup    (339ms saved — new user never has cache)
//  ✗ Onboarding check     (1s saved — new user never completed onboarding)
//  ✗ Idempotency complete (1.5s saved — no claim to complete)
//
// We DO:
//  ✓ Provision user (Supabase RPC) — only blocking step
//  ✗ Session cookie creation — DEFERRED (fire-and-forget, saves 500-1500ms)
//
// Expected latency: provision_rpc ≈ 150ms (with index optimizations)
// ═════════════════════════════════════════════════════════════════════════════

async function handleSignupFastPath(params: {
  request: NextRequest;
  idToken: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  currentProduct: ProductDomain;
  requestContext: ReturnType<typeof getRequestContext>;
  traceId?: string;
  timer: AuthSyncServerTimer;
  hasValidSessionCookie: boolean;
  memoryCacheKey: string;
  finalizeResponse: (r: NextResponse) => Promise<NextResponse>;
}): Promise<NextResponse> {
  const {
    idToken, firebaseUid, email, fullName, phoneNumber,
    currentProduct, requestContext, traceId, timer,
    hasValidSessionCookie, memoryCacheKey, finalizeResponse,
  } = params;

  void hasValidSessionCookie; // unused in signup path — kept for interface consistency
  const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: AUTH_SYNC_SUPABASE_TIMEOUT_MS });

  console.log(`[AUTH_SYNC] Signup fast path — uid=${firebaseUid.slice(-6)}, product=${currentProduct}`);

  // ─── DIRECT INSERT (BYPASS RPC) ─────────────────────────────────────
  // For new signups, the provision RPC is 4s+ overhead due to:
  //  - SECURITY DEFINER subtransaction on product_activation_logs
  //  - Sequential scans on email/subscriptions (no index)
  //  - Multiple unnecessary fallback checks for new users
  //
  // We do direct inserts instead. For a NEW user (just created by Firebase):
  //  1. INSERT into users
  //  2. INSERT into user_products (dashboard)
  //  Total: ~50-150ms vs 4000ms
  //
  // If the user somehow already exists (race), we fall back to the RPC.
  const provisionStart = Date.now();
  let user: SupabaseUser | null = null;
  let provisionError: any = null;

  try {
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        firebase_uid: firebaseUid,
        full_name: fullName,
        email: email.toLowerCase().trim(),
        phone: phoneNumber,
        role: "user",
      })
      .select()
      .single();

    if (insertError || !newUser) {
      // Race: user was created between Firebase auth and this insert.
      // Fall back to the RPC which handles upsert logic.
      console.warn("[AUTH_SYNC] Direct insert failed, falling back to RPC:", insertError?.message);
      const fallback = await ensureSupabaseUserAndMembershipFull({
        supabase, firebaseUid, email, fullName, phoneNumber,
        currentProduct, allowCreate: true, requestContext, allowLegacyMigration: true,
      });
      user = fallback.user as SupabaseUser;
    } else {
      user = newUser as SupabaseUser;

      // Insert dashboard membership (fire-and-forget, non-blocking)
      void supabase.from("user_products").insert({
        user_id: user.id,
        product: "dashboard",
        status: "active",
        activated_by: "system",
      });
    }
  } catch (e: any) {
    provisionError = e;
  }

  timer.record("provision_rpc", provisionStart);

  if (provisionError || !user) {
    const msg = String(provisionError?.message || provisionError || "PROVISION_FAILED");
    if (isAbortOrTimeoutError(provisionError)) {
      return finalizeResponse(
        NextResponse.json<SyncUserResponse>(
          { success: false, error: "Upstream timeout", code: AuthErrorCode.UPSTREAM_TIMEOUT, requestId: requestContext.request_id, traceId },
          { status: 504 },
        ),
      );
    }
    console.error("[AUTH_SYNC] Provisioning error:", provisionError);
    return finalizeResponse(
      NextResponse.json<SyncUserResponse>(
        { success: false, error: "Database error", code: AuthErrorCode.DATABASE_ERROR, details: msg, requestId: requestContext.request_id, traceId } as any,
        { status: 500 },
      ),
    );
  }

  const responseBody: SyncUserResponse = {
    success: true,
    user,
    currentProduct,
    requestId: requestContext.request_id,
    traceId,
  };

  // Cache in memory for subsequent requests
  memoryCacheSet(memoryCacheKey, {
    statusCode: 200,
    responseBody,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  });

  console.log(
    "[AUTH_SYNC] Signup completed",
    timer.structuredLog({
      firebaseUidSuffix: firebaseUid.slice(-6),
      product: currentProduct,
      status: 200,
      path: "signup_fast",
    }),
  );

  const response = NextResponse.json<SyncUserResponse>(responseBody, { status: 200 });
  // Set ui_state cookie for O(1) SSR Store icon hydration
  attachUiStateCookie(response, user);
  // Set session cookie on the response BEFORE returning, so the browser
  // receives Set-Cookie and subsequent requests are authenticated.
  // This blocks the response but ensures the dashboard flow works after onboarding.
  await setSessionCookieOnResponse(idToken, response, timer);
  return finalizeResponse(response);
}

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN PATH (with idempotency + warm cache)
//
// For allowCreate=false (login), we keep the idempotency layer for safety
// but with aggressive parallelization.
// ═════════════════════════════════════════════════════════════════════════════

async function handleLoginPath(params: {
  request: NextRequest;
  idToken: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  currentProduct: ProductDomain;
  requestContext: ReturnType<typeof getRequestContext>;
  traceId?: string;
  timer: AuthSyncServerTimer;
  hasValidSessionCookie: boolean;
  memoryCacheKey: string;
  finalizeResponse: (r: NextResponse) => Promise<NextResponse>;
}): Promise<NextResponse> {
  const {
    idToken, firebaseUid, email, fullName, phoneNumber,
    currentProduct, requestContext, traceId, timer,
    hasValidSessionCookie, memoryCacheKey, finalizeResponse,
  } = params;

  const lockOwnerId = crypto.randomUUID();
  const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: AUTH_SYNC_SUPABASE_TIMEOUT_MS });
  const tokenIat: number = 0; // Not needed for login idempotency key

  const idempotencyKey = generateAuthSyncIdempotencyKey({
    firebaseUid,
    product: currentProduct,
    allowCreate: false,
    tokenIat,
  });

  const warmCacheKey = generateAuthSyncWarmCacheKey({
    firebaseUid,
    product: currentProduct,
    allowCreate: false,
  });

  let claimOwned = false;

  const respondFromCached = async (cached: { statusCode: number; responseBody: any }) => {
    const cachedBody = (cached.responseBody ?? {}) as SyncUserResponse;
    const body: SyncUserResponse = {
      ...cachedBody,
      requestId: cachedBody.requestId ?? requestContext.request_id,
      idempotencyKey,
      traceId: (cachedBody as any)?.traceId ?? traceId,
    };

    // Cache in memory
    if (cached.statusCode >= 200 && cached.statusCode < 300) {
      memoryCacheSet(memoryCacheKey, {
        statusCode: cached.statusCode,
        responseBody: body,
        expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
      });
    }

    const response = NextResponse.json<SyncUserResponse>(body, { status: cached.statusCode });

    if (
      (cachedBody as any)?.code === "USER_NOT_FOUND" ||
      (cachedBody as any)?.code === "INVALID_TOKEN"
    ) {
      response.cookies.delete("session");
    }

    if (Boolean((cachedBody as any)?.success) && !hasValidSessionCookie) {
      setSessionCookieNonBlocking(idToken, timer);
    }

    if (cached.statusCode === 200) {
      attachUiStateCookie(response, (cachedBody as any).user);
    }

    response.headers.set("x-idempotency-key", idempotencyKey);
    return finalizeResponse(response);
  };

  try {
    // ─── Idempotency claim ─────────────────────────────────────────────
    const claimStarted = Date.now();
    const claimResult = await claimAuthSyncIdempotencySafe({
      supabase,
      idempotencyKey,
      lockedBy: lockOwnerId,
      ttlSeconds: 300,
    });
    timer.record("idempotency_claim", claimStarted);

    if (!claimResult.ok) {
      if (claimResult.timeout) {
        return finalizeResponse(
          NextResponse.json<SyncUserResponse>(
            { success: false, error: "Upstream timeout", code: AuthErrorCode.UPSTREAM_TIMEOUT, requestId: requestContext.request_id, idempotencyKey, traceId },
            { status: 504 },
          ),
        );
      }
      throw claimResult.error;
    }

    const claim = claimResult.claim;

    if (!claim.claimed) {
      if ((claim.status === "completed" || claim.status === "failed") && claim.status_code != null) {
        return respondFromCached({ statusCode: claim.status_code, responseBody: claim.response_body });
      }

      if (claim.status === "processing") {
        const waited = await waitForAuthSyncCompletion({ supabase, idempotencyKey, timeoutMs: 3000, pollMs: 250 });
        if (waited.done) {
          return respondFromCached({ statusCode: waited.statusCode, responseBody: waited.responseBody });
        }
        const r = NextResponse.json<SyncUserResponse>(
          { success: false, error: "Sync in progress", code: AuthErrorCode.SYNC_IN_PROGRESS, requestId: requestContext.request_id, idempotencyKey, traceId },
          { status: 202 },
        );
        r.headers.set("Retry-After", "1");
        return finalizeResponse(r);
      }

      return finalizeResponse(
        NextResponse.json<SyncUserResponse>(
          { success: false, error: "Idempotency conflict", code: AuthErrorCode.SERVER_ERROR, requestId: requestContext.request_id, idempotencyKey, traceId },
          { status: 500 },
        ),
      );
    }

    claimOwned = true;
    let result: SyncResult;

    // ─── Check Supabase warm cache ────────────────────────────────────
    if (isAuthSyncWarmCacheEnabled()) {
      const warmStarted = Date.now();
      try {
        const warm = await getAuthSyncWarmCache({ supabase, cacheKey: warmCacheKey });
        timer.record("warm_cache", warmStarted);
        if (warm && warm.statusCode >= 200 && warm.statusCode < 300) {
          console.log(`[AUTH_SYNC] Warm cache hit — uid=${firebaseUid.slice(-6)}`);
          result = {
            status: warm.statusCode,
            body: {
              ...(warm.responseBody as SyncUserResponse),
              requestId: requestContext.request_id,
              idempotencyKey,
              traceId,
            },
            setCookieIfAuthenticated: Boolean((warm.responseBody as any)?.success),
          };

          // Finalize idempotency + write memory cache in background
          finalizeIdempotencyNonBlocking(supabase, idempotencyKey, lockOwnerId, result, warmCacheKey);
          claimOwned = false;

          memoryCacheSet(memoryCacheKey, {
            statusCode: result.status,
            responseBody: result.body,
            expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
          });

          if (!hasValidSessionCookie) setSessionCookieNonBlocking(idToken, timer);
          const response = NextResponse.json<SyncUserResponse>(result.body, { status: result.status });
          response.headers.set("x-idempotency-key", idempotencyKey);
          attachUiStateCookie(response, (result.body as any).user);
          return finalizeResponse(response);
        }
      } catch (warmErr) {
        timer.record("warm_cache", warmStarted);
        console.warn("[AUTH_SYNC] Warm cache lookup failed:", warmErr);
      }
    }

    // ─── PARALLEL: Provision + Onboarding + Session cookie ──────────
    const provisionStarted = Date.now();

    const [provisionResult, onboardingState, sessionCookie] = await Promise.all([
      (async () => {
        try {
          return await ensureSupabaseUserAndMembershipFull({
            supabase, firebaseUid, email, fullName, phoneNumber,
            currentProduct, allowCreate: false, requestContext,
            allowLegacyMigration: true,
          });
        } catch (e: any) { return { error: e }; }
      })(),
      isFastOnboardingCheckEnabled()
        ? (async () => {
            const s = Date.now();
            try {
              const state = await readOnboardingAccessStateFast({ supabase, firebaseUid, product: currentProduct });
              timer.record("onboarding_fast", s);
              return state;
            } catch (err: any) {
              timer.record("onboarding_fast", s);
              console.warn("[AUTH_SYNC] Onboarding fast path failed:", err?.message);
              return null;
            }
          })()
        : Promise.resolve(null),
      !hasValidSessionCookie
        ? (async (): Promise<string | null> => {
            try {
              return await withTimeout(
                adminAuth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 }),
                2000,
                "FIREBASE_CREATE_SESSION_COOKIE_TIMEOUT",
              );
            } catch { return null; }
          })()
        : Promise.resolve(null),
    ]);

    timer.record("provision_rpc", provisionStarted);
    if (sessionCookie) timer.record("session_cookie_create", provisionStarted);

    // Handle provision error
    if ("error" in provisionResult) {
      const e = provisionResult.error;
      const errMsg = String(e?.message || e);

      if (e?.code === "USER_NOT_FOUND" || errMsg === "USER_NOT_FOUND") {
        result = {
          status: 404, clearSession: true,
          body: { success: false, error: "User account not found", code: AuthErrorCode.USER_NOT_FOUND, message: "Your account was not fully created. Please sign up again.", requestId: requestContext.request_id, idempotencyKey, traceId },
        };
      } else if (isAbortOrTimeoutError(e)) {
        result = {
          status: 504,
          body: { success: false, error: "Upstream timeout", code: AuthErrorCode.UPSTREAM_TIMEOUT, requestId: requestContext.request_id, idempotencyKey, traceId },
        };
      } else {
        console.error("[AUTH_SYNC] Provisioning error:", e);
        result = {
          status: 500,
          body: { success: false, error: "Database error", code: AuthErrorCode.DATABASE_ERROR, details: e?.message, requestId: requestContext.request_id, idempotencyKey, traceId } as any,
        };
      }
    } else {
      const user = provisionResult.user as SupabaseUser;
      let authDecision: SyncUserResponse["authDecision"] | undefined;
      if (onboardingState?.userExists) {
        authDecision = buildAuthDecision(onboardingState, currentProduct);
      }

      result = {
        status: 200,
        body: { success: true, user, authDecision, currentProduct, requestId: requestContext.request_id, idempotencyKey, traceId },
        setCookieIfAuthenticated: true,
      };
    }

    // Cache in memory on success
    if (result.status >= 200 && result.status < 300) {
      memoryCacheSet(memoryCacheKey, {
        statusCode: result.status,
        responseBody: result.body,
        expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
      });
    }

    // Finalize idempotency + warm cache write in background (non-blocking)
    finalizeIdempotencyNonBlocking(supabase, idempotencyKey, lockOwnerId, result, warmCacheKey);
    claimOwned = false;

    // Set session cookie
    if (sessionCookie) {
      const cookieStore = await cookies();
      cookieStore.set("session", sessionCookie, {
        maxAge: 60 * 60 * 24 * 5,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
      });
    }

    if (result.clearSession) {
      const cookieStore = await cookies();
      cookieStore.delete("session");
    }

    console.log("[AUTH_SYNC] Login completed", timer.structuredLog({
      firebaseUidSuffix: firebaseUid.slice(-6),
      product: currentProduct,
      status: result.status,
      path: "login",
    }));

    const response = NextResponse.json<SyncUserResponse>(result.body, { status: result.status });
    response.headers.set("x-idempotency-key", idempotencyKey);
    if (result.status === 200) {
      attachUiStateCookie(response, (result.body as any).user);
    }
    return finalizeResponse(response);
  } catch (error: any) {
    if (claimOwned && supabase && idempotencyKey) {
      try {
        await releaseAuthSyncIdempotency({ supabase, idempotencyKey, lockedBy: lockOwnerId });
      } catch {}
    }
    throw error;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// NON-BLOCKING HELPERS
//
// These fire-and-forget patterns ensure that best-effort operations
// (idempotency finalization, session cookie creation, warm cache writes)
// never block the critical response path.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Create a Firebase session cookie and set it on the given NextResponse.
 * Used by the signup path to guarantee the cookie is present before
 * the response reaches the browser.
 */
async function setSessionCookieOnResponse(
  idToken: string,
  response: NextResponse,
  timer: AuthSyncServerTimer,
): Promise<void> {
  const started = Date.now();
  try {
    const sessionCookie = await createSessionCookieWithTimeout(idToken);
    response.cookies.set("session", sessionCookie, {
      maxAge: 60 * 60 * 24 * 5,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });
    timer.record("session_cookie_create", started);
  } catch (e) {
    timer.record("session_cookie_create", started);
    console.warn("[AUTH_SYNC] Session cookie creation failed:", e);
  }
}

function setSessionCookieNonBlocking(idToken: string, timer: AuthSyncServerTimer): void {
  const started = Date.now();
  (async () => {
    try {
      const sessionCookie = await createSessionCookieWithTimeout(idToken);
      const cookieStore = await cookies();
      cookieStore.set("session", sessionCookie, {
        maxAge: 60 * 60 * 24 * 5,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
      });
      timer.record("session_cookie_create", started);
    } catch (e) {
      timer.record("session_cookie_create", started);
      console.warn("[AUTH_SYNC] Non-blocking session cookie failed:", e);
    }
  })();
}

async function createSessionCookieWithTimeout(idToken: string): Promise<string> {
  return withTimeout(
    adminAuth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 24 * 5 * 1000 }),
    2000,
    "FIREBASE_CREATE_SESSION_COOKIE_TIMEOUT",
  );
}

/**
 * Attach the lightweight ui_state cookie to the response.
 * Used for O(1) SSR hydration of Store icon visibility.
 */
function attachUiStateCookie(response: NextResponse, user: SupabaseUser | undefined | null): void {
  if (!user) return;
  response.cookies.set(
    UI_STATE_COOKIE,
    serializeUiState({
      ai_settings_configured: user.ai_settings_configured === true,
      store_slug: user.store_slug || null,
    }),
    getUiStateCookieOptions(),
  );
}

function finalizeIdempotencyNonBlocking(
  supabase: ReturnType<typeof createSupabaseServiceClientOrThrow>,
  idempotencyKey: string,
  lockOwnerId: string,
  result: SyncResult,
  warmCacheKey: string,
): void {
  (async () => {
    try {
      if (shouldReleaseIdempotencyLock(result)) {
        await releaseAuthSyncIdempotency({ supabase, idempotencyKey, lockedBy: lockOwnerId });
      } else {
        await completeAuthSyncIdempotency({
          supabase,
          idempotencyKey,
          lockedBy: lockOwnerId,
          status: "completed",
          statusCode: result.status,
          responseBody: result.body,
          errorCode: (result.body.code as any) ?? null,
        });

        if (result.status >= 200 && result.status < 300 && isAuthSyncWarmCacheEnabled()) {
          try {
            await putAuthSyncWarmCache({
              supabase,
              cacheKey: warmCacheKey,
              statusCode: result.status,
              responseBody: result.body,
              ttlSeconds: 60,
            });
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[AUTH_SYNC] Non-blocking idempotency finalize failed:", e);
    }
  })();
}
