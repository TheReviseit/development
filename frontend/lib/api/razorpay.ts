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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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
  domain?: string; // NEW: Domain context
  request_id?: string;
  idempotency_hit?: boolean;
  error?: string;
  error_code?: string;
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
 * Create a new subscription order
 */
export async function createSubscription(
  planName: "starter" | "business" | "pro",
  customerEmail: string,
  customerName?: string,
  customerPhone?: string,
  userId?: string,
): Promise<RazorpayOrder> {
  const requestId = getPaymentRequestId();
  const idempotencyKey = userId
    ? getIdempotencyKey(userId, planName)
    : undefined;

  const response = await fetch(`${BACKEND_URL}/api/subscriptions/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(userId && { "X-User-Id": userId }),
    },
    body: JSON.stringify({
      plan_name: planName,
      customer_email: customerEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      idempotency_key: idempotencyKey,
      // Domain resolved server-side from Host header — never sent by client
    }),
  });

  return response.json();
}

/**
 * Create subscription with automatic retry for transient errors.
 *
 * Retry Logic:
 * - Retryable errors: 503 (server unavailable), 504 (timeout), network errors
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
  maxRetries: number = 2,
): Promise<RazorpayOrder> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await createSubscription(
        planName,
        customerEmail,
        customerName,
        customerPhone,
        userId,
        // Domain resolved server-side — not passed by client
      );

      // Success or idempotency hit - return immediately
      if (result.success || result.idempotency_hit) {
        return result;
      }

      // Check if error is retryable
      const errorCode = result.error_code;
      const isRetryable =
        errorCode === "RAZORPAY_SERVER_ERROR" || // 503 from Razorpay
        errorCode === "TIMEOUT" || // Network timeout
        errorCode === "NETWORK_ERROR"; // Network issue

      // Non-retryable errors - return immediately
      const isNonRetryable =
        errorCode === "RAZORPAY_BAD_REQUEST" || // 400 - bad data
        errorCode === "DUPLICATE_SUBSCRIPTION" || // 409 - already exists
        errorCode === "DATABASE_ERROR" || // DB constraint violation
        errorCode === "UNAUTHORIZED"; // Auth failure

      if (isNonRetryable) {
        console.log(
          `[Payment] Non-retryable error: ${errorCode}, returning immediately`,
        );
        return result;
      }

      // If retryable and we have retries left, wait and try again
      if (isRetryable && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(
          `[Payment] Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Not clearly retryable or non-retryable - return result
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[Payment] Request error (attempt ${attempt + 1}):`, error);

      // Network errors are retryable
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`[Payment] Network error, retrying after ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
    }
  }

  // All retries exhausted
  throw (
    lastError || new Error("Subscription creation failed after all retries")
  );
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

  const response = await fetch(`${BACKEND_URL}/api/subscriptions/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(userId && { "X-User-Id": userId }),
    },
    body: JSON.stringify(params),
  });

  return response.json();
}

/**
 * Get current user's subscription status
 */
export async function getSubscriptionStatus(
  userId?: string,
): Promise<SubscriptionStatus> {
  const requestId = generateRequestId(); // Fresh ID for status checks

  const response = await fetch(`${BACKEND_URL}/api/subscriptions/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(userId && { "X-User-Id": userId }),
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

  const response = await fetch(`${BACKEND_URL}/api/subscriptions/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(userId && { "X-User-Id": userId }),
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

  const razorpayOptions = {
    key: options.keyId,
    subscription_id: options.subscriptionId,
    name: "Flowauxi",
    description: `${options.planName} Plan Subscription`,
    prefill: {
      name: options.customerName || "",
      email: options.customerEmail,
      contact: options.customerPhone || "",
    },
    timeout: 300, // 5 minutes for UPI QR
    retry: {
      enabled: true,
      max_count: 4,
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
        razorpay_subscription_id: response.razorpay_subscription_id,
        razorpay_signature: response.razorpay_signature,
      });
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
  const response = await fetch(`${BACKEND_URL}/api/subscriptions/change-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": authToken,
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
  const response = await fetch(
    `${BACKEND_URL}/api/subscriptions/cancel-change`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": authToken,
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
  const response = await fetch(
    `${BACKEND_URL}/api/subscriptions/pending-change`,
    {
      headers: {
        "X-User-Id": authToken,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to get pending change");
  }

  return data.pending_change || null;
}
