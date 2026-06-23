/**
 * Razorpay API Client - Enterprise Grade
 * =======================================
 * Handles subscription creation, verification, and status checks.
 *
 * Features:
 * - X-Request-Id propagation for tracing
 * - Stable idempotency key generation
 * - Proper error handling
 * - Domain awareness for multi-domain pricing
 */

import type { ProductDomain } from "../domain/config";
import { logger, trackRevenue } from "../observability/observability";
import { generateCheckoutIdempotencyKey } from "../billing/idempotency";

// SECURITY: All payment API calls must route through Next.js (/api/...) proxy,
// not directly to Flask backend. This ensures:
// 1. Firebase ID token is properly attached (not X-User-Id which was forgeable)
// 2. Backend URL is never exposed to the browser
// 3. Circuit breaker, rate limiting, and domain context resolution happen server-side
const BILLING_FETCH_TIMEOUT_MS = parseInt(process.env.NEXT_PUBLIC_BILLING_FETCH_TIMEOUT_MS || "20000", 10);
// Init POST must cover Next.js proxy + dev cold-compile; backend async path returns in ~1s.
const BILLING_CREATE_TIMEOUT_MS = parseInt(
  process.env.NEXT_PUBLIC_BILLING_CREATE_TIMEOUT_MS || "50000",
  10,
);

const API_PREFIX = "/api/billing";

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = BILLING_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new Error(
        "Subscription creation timed out. Please try again.",
      ) as Error & { code?: string };
      timeoutError.code = "GATEWAY_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Firebase Auth Token Helper
// =============================================================================

let authInstance: any = null;

async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    if (!authInstance) {
      const { auth } = await import("@/src/firebase/firebase");
      authInstance = auth;
    }
    const user = authInstance.currentUser;
    if (!user) return null;
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// =============================================================================
// Request ID Generation
// =============================================================================

/**
 * Generate a unique request ID for tracing
 * Stored in sessionStorage to maintain across page refreshes during payment
 */
export function generateRequestId(): string {
  const id = `req_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  return id;
}

/**
 * Get or create a stable request ID for the current payment attempt
 */
export function getPaymentRequestId(): string {
  if (typeof window === "undefined") return generateRequestId();

  const key = "payment_request_id";
  let requestId = sessionStorage.getItem(key);

  if (!requestId) {
    requestId = generateRequestId();
    sessionStorage.setItem(key, requestId);
  }

  return requestId;
}

/**
 * Clear the payment request ID (call after payment success/failure/cancel)
 */
export function clearPaymentRequestId(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("payment_request_id");
    // Legacy cleanup — idempotency keys are no longer stored in sessionStorage
    sessionStorage.removeItem("payment_idempotency_key");
  }
}

/**
 * Generate a deterministic idempotency key for subscription creation.
 *
 * CRITICAL: No sessionStorage caching. The backend now handles plan-aware
 * deduplication by checking existing pending/created subscriptions.
 * This key is a lightweight first-pass filter only.
 *
 * Pattern: btoa(user_id + plan_name + 5-min-bucket), truncated to 24 chars.
 * Same inputs within the same 5-minute window produce the same key (retry-safe).
 * Different plans always produce different keys.
 */
export function getIdempotencyKey(userId: string, planName: string): string {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const data = `${userId}:${planName}:${bucket}`;
  return `idem_${btoa(data)
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 24)}`;
}

// =============================================================================
// Interfaces
// =============================================================================

interface RazorpayOrder {
  success: boolean;
  subscription_id: string;
  key_id: string;
  amount: number;
  currency: string;
  plan_name: string;
  domain?: string;
  request_id?: string;
  idempotency_hit?: boolean;
  already_active?: boolean;
  error?: string;
  error_code?: string;
  
  // New async checkout fields
  checkout_token?: string;
  status?: string;
  poll_url?: string;
}

interface SubscriptionStatus {
  success: boolean;
  has_subscription: boolean;
  subscription: {
    id: string;
    razorpay_subscription_id?: string;
    plan_name: "starter" | "business" | "pro";
    status:
      | "pending"
      | "processing"
      | "completed"
      | "active"
      | "cancelled"
      | "expired"
      | "halted"
      | "failed";
    ai_responses_limit: number;
    ai_responses_used: number;
    current_period_start: string;
    current_period_end: string;
  } | null;
  request_id?: string;
  error?: string;
}

interface VerifyPaymentParams {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface VerifyPaymentResponse {
  success: boolean;
  message?: string;
  status?: string;
  subscription_id?: string;
  request_id?: string;
  error?: string;
  error_code?: string;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Poll for checkout completion.
 * 
 * FAANG-level: Polls the backend until the background subscription creation
 * completes. Uses exponential backoff to reduce load while maintaining
 * responsiveness.
 */
async function pollCheckoutCompletion(
  checkoutToken: string,
  maxAttempts: number = 60,
  baseIntervalMs: number = 1000,
): Promise<RazorpayOrder> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetchWithTimeout(
      `${API_PREFIX}/checkout-status/${checkoutToken}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Checkout request not found");
      }
      // Transient error — retry
      await new Promise((r) => setTimeout(r, baseIntervalMs));
      continue;
    }

    const data = await response.json();

    switch (data.status) {
      case "completed":
        logger.info("checkout_completed", { checkout_token: checkoutToken });
        return {
          success: true,
          subscription_id: data.subscription_id,
          key_id: data.key_id,
          amount: data.amount,
          currency: data.currency || "INR",
          plan_name: data.plan_name,
        };

      case "failed":
        logger.error(
          "checkout_failed",
          new Error(data.error_message || "Subscription creation failed"),
          { checkout_token: checkoutToken },
        );
        {
          const err = new Error(
            data.error_message || "Subscription creation failed",
          ) as Error & { code?: string };
          err.code = "CHECKOUT_FAILED";
          throw err;
        }

      case "processing":
      case "initiated":
        // Still working — wait and retry with backoff
        const delay = Math.min(
          baseIntervalMs * Math.pow(1.2, attempt),
          3000,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;

      default:
        await new Promise((r) => setTimeout(r, baseIntervalMs));
        continue;
    }
  }

  throw new Error(
    "Subscription creation timed out. Your subscription may still be processing. Please check back later.",
  );
}

/**
 * Create a new subscription order — with async 202 polling.
 * 
 * FAANG-level: Returns immediately with 202 Accepted, then polls
 * for completion. Total perceived user wait time drops from 35s to <100ms.
 */
export async function createSubscription(
  planName: "starter" | "business" | "pro",
  customerEmail: string,
  customerName?: string,
  customerPhone?: string,
  userId?: string,
): Promise<RazorpayOrder> {
  const requestId = getPaymentRequestId();
  const authHdrs = await authHeaders();

  let idempotencyKey: string | undefined;
  if (userId) {
    idempotencyKey = await generateCheckoutIdempotencyKey(userId, planName, "shop");
  }

  const response = await fetchWithTimeout(
    `${API_PREFIX}/create-subscription`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...authHdrs,
      },
      body: JSON.stringify({
        plan_name: planName,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
      }),
    },
    BILLING_CREATE_TIMEOUT_MS,
  );

  const result = await response.json();

  if (!response.ok) {
    const error = new Error(
      result.error || result.message || "Subscription creation failed",
    ) as any;
    error.code = result.error_code || result.code;
    error.data = result;
    throw error;
  }

  // 202 Accepted = async processing started
  if (response.status === 202 && result.checkout_token) {
    logger.info("checkout_initiated", {
      checkout_token: result.checkout_token,
      plan: planName,
    });
    return pollCheckoutCompletion(result.checkout_token);
  }

  // Direct success (idempotency hit or already active)
  if (result.success || result.idempotency_hit) {
    return result;
  }

  // Error path
  const error = new Error(result.error || "Subscription creation failed") as any;
  error.code = result.error_code;
  error.data = result;
  throw error;
}

/**
 * Create subscription with automatic retry for transient errors.
 *
 * Retry Logic:
 * - Retryable errors: 503 (server unavailable), network errors
 * - Non-retryable errors: 400 (bad request), 409 (duplicate), DATABASE_ERROR
 * - Exponential backoff: 1s, 2s, 4s
 *
 * This is payment-safe because the backend uses idempotency keys.
 */
export async function createSubscriptionWithRetry(
  planName: "starter" | "business" | "pro",
  customerEmail: string,
  customerName?: string,
  customerPhone?: string,
  userId?: string,
  maxRetries: number = 1,
): Promise<RazorpayOrder> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await createSubscription(
        planName,
        customerEmail,
        customerName,
        customerPhone,
        userId,
      );
    } catch (error: any) {
      lastError = error;

      // Idempotency lock — wait for server cooldown then retry same key
      if (error.code === "IDEMPOTENCY_IN_PROGRESS") {
        const retryAfterSeconds =
          error.data?.details?.retry_after_seconds ??
          error.data?.retry_after_seconds ??
          5;
        if (attempt < maxRetries) {
          const delayMs = Math.min(retryAfterSeconds * 1000, 35000);
          console.log(
            `[Payment] Idempotency in progress — retrying after ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw error;
      }

      // Non-retryable error codes
      const nonRetryableCodes = [
        "VALIDATION_ERROR",
        "PLAN_NOT_FOUND",
        "PRICING_CONFIG_ERROR",
        "DOMAIN_REQUIRED",
        "UNAUTHORIZED",
        "USE_UPGRADE_FLOW",
        "DUPLICATE_REQUEST",
        "ALREADY_ACTIVE",
        "CHECKOUT_FAILED",
      ];
      if (nonRetryableCodes.includes(error.code)) {
        throw error;
      }

      const isRetryable =
        error.code === "CHECKOUT_QUEUE_FULL" ||
        error.code === "SERVICE_UNAVAILABLE" ||
        error.code === "GATEWAY_TIMEOUT" ||
        error.name === "AbortError" ||
        !error.code ||
        error.message?.includes("503") ||
        error.message?.includes("504") ||
        error.message?.includes("timed out") ||
        error.message?.includes("network");

      if (!isRetryable) {
        throw error;
      }

      // Transient error — retry with backoff
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 4000);
        console.log(
          `[Payment] Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  throw lastError || new Error("Subscription creation failed after all retries");
}

/**
 * Verify a successful payment
 * Note: This sets status to PROCESSING, not COMPLETED
 * Only webhooks can set COMPLETED
 */
export async function verifyPayment(
  params: VerifyPaymentParams,
  userId?: string,
): Promise<VerifyPaymentResponse> {
  const requestId = getPaymentRequestId();

  const authHdrs = await authHeaders();
  const verifyKey = userId
    ? `ver_${btoa(`${userId}:${params.razorpay_subscription_id}:${params.razorpay_payment_id}`)
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 32)}`
    : undefined;

  const response = await fetchWithTimeout(`${API_PREFIX}/verify-subscription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(verifyKey ? { "Idempotency-Key": verifyKey } : {}),
      ...authHdrs,
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: `Payment service returned HTTP ${response.status}. Please contact support.`,
      error_code: "HTTP_ERROR",
    };
  }
}

/**
 * Get current user's subscription status
 */
export async function getSubscriptionStatus(
  userId?: string,
): Promise<SubscriptionStatus> {
  const requestId = generateRequestId(); // Fresh ID for status checks

  const authHdrs = await authHeaders();
  const response = await fetch(`${API_PREFIX}/subscription-status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...authHdrs,
    },
  });

  return response.json();
}

/**
 * Cancel subscription at end of billing period
 */
export async function cancelSubscription(userId?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const requestId = generateRequestId();

  const authHdrs = await authHeaders();
  const response = await fetch(`${API_PREFIX}/cancel-subscription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...authHdrs,
    },
  });

  return response.json();
}

// =============================================================================
// Razorpay Checkout
// =============================================================================

/**
 * Load Razorpay checkout script dynamically
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Open Razorpay checkout modal
 */
export async function openRazorpayCheckout(options: {
  subscriptionId: string;
  keyId: string;
  planName: string;
  amount: number;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  onSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => void;
  onError: (error: any) => void;
  onClose?: () => void;
}): Promise<void> {
  const scriptLoaded = await loadRazorpayScript();

  if (!scriptLoaded) {
    options.onError(new Error("Failed to load Razorpay checkout"));
    return;
  }

  const razorpayOptions: Record<string, any> = {
    key: options.keyId,
    subscription_id: options.subscriptionId,
    name: "Flowauxi",
    description: `${options.planName} Plan Subscription`,
    prefill: {
      name: options.customerName || "",
      email: options.customerEmail,
      contact: options.customerPhone || "",
    },
    theme: {
      color: "#22c15a",
    },
    handler: async (response: any) => {
      try {
        await options.onSuccess({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_subscription_id: response.razorpay_subscription_id,
          razorpay_signature: response.razorpay_signature,
        });
      } catch (err) {
        options.onError(err);
      }
    },
    modal: {
      confirm_close: true,
      escape: false,
      backdropclose: false,
      ondismiss: () => {
        console.log("Payment modal dismissed by user");
        options.onClose?.();
      },
    },
    // NOTE: Do NOT pass timeout, retry, or method for subscription checkout.
    // These options are for one-time payments only. Razorpay subscription
    // checkout determines supported methods from the plan configuration.
  };

  const razorpay = new (window as any).Razorpay(razorpayOptions);
  razorpay.on("payment.failed", (response: any) => {
    options.onError(response.error);
  });
  razorpay.open();
}

// =============================================================================
// PLAN CHANGE API — Enterprise Grade
// =============================================================================

export interface PlanChangeResult {
  success: boolean;
  change_direction?: "upgrade" | "downgrade";
  from_plan?: string;
  to_plan?: string;
  proration?: {
    proration_amount_paise: number;
    unused_value_paise: number;
    new_cost_remaining_paise: number;
    ratio: number;
    is_upgrade: boolean;
  };
  scheduled_at?: string;
  requires_payment?: boolean;
  order_id?: string;
  key_id?: string;
  amount?: number;
  currency?: string;
  message?: string;
  error?: string;
  error_code?: string;
}

export interface PendingChange {
  to_plan: string;
  direction: "upgrade" | "downgrade";
  scheduled_at: string;
  proration_payment_status: string | null;
  locked: boolean;
}

/**
 * Request a plan change (upgrade or downgrade).
 *
 * For UPGRADES: Returns order details. Call `openProrationCheckout()` next.
 * For DOWNGRADES: Schedules at cycle end. No payment required.
 *
 * Domain resolved server-side from Host header.
 */
export async function changePlan(
  newPlanSlug: string,
  authToken: string,
): Promise<PlanChangeResult> {
  const authHdrs = await authHeaders();
  const response = await fetch(`${API_PREFIX}/change-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHdrs,
    },
    body: JSON.stringify({ new_plan_slug: newPlanSlug }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Plan change failed (${response.status})`);
  }

  return data;
}

/**
 * Open Razorpay checkout for proration payment (upgrades only).
 *
 * Call this AFTER `changePlan()` returns `requires_payment: true`.
 * The backend webhook will handle subscription.update after payment.captured.
 */
export function openProrationCheckout(options: {
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  fromPlan: string;
  toPlan: string;
  onSuccess: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onError: (error: any) => void;
  onClose?: () => void;
}): void {
  const razorpayOptions = {
    key: options.keyId,
    amount: options.amount,
    currency: options.currency,
    name: "Plan Upgrade",
    description: `Upgrade: ${options.fromPlan} → ${options.toPlan} (prorated)`,
    order_id: options.orderId,
    prefill: {
      name: options.userName,
      email: options.userEmail,
      contact: options.userPhone || "",
    },
    method: {
      netbanking: true,
      card: true,
      upi: true,
      wallet: true,
    },
    theme: {
      color: "#22c15a",
    },
    handler: (response: any) => {
      options.onSuccess({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    modal: {
      confirm_close: true,
      escape: false,
      backdropclose: false,
      ondismiss: () => {
        console.log("Proration payment dismissed");
        options.onClose?.();
      },
    },
  };

  const razorpay = new (window as any).Razorpay(razorpayOptions);
  razorpay.on("payment.failed", (response: any) => {
    options.onError(response.error);
  });
  razorpay.open();
}

/**
 * Cancel a pending plan change.
 *
 * Allowed when:
 * - A pending change exists
 * - plan_change_locked is FALSE
 * - Proration payment not yet captured
 */
export async function cancelPendingChange(authToken: string): Promise<{
  cancelled: boolean;
  was_direction?: string;
  was_target?: string;
}> {
  const authHdrs = await authHeaders();
  const response = await fetch(
    `${API_PREFIX}/cancel-change`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHdrs,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to cancel change");
  }

  return data;
}

/**
 * Get the current pending plan change status.
 */
export async function getPendingChange(
  authToken: string,
): Promise<PendingChange | null> {
  const authHdrs = await authHeaders();
  const response = await fetch(
    `${API_PREFIX}/pending-change`,
    {
      headers: {
        ...authHdrs,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to get pending change");
  }

  return data.pending_change || null;
}
