/**
 * Razorpay API Client - Enterprise Grade
 * =======================================
 * Handles subscription creation, verification, and status checks.
 *
 * Features:
 * - X-Request-Id propagation for tracing
 * - Stable idempotency key generation
 * - Proper error handling
 */

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
 * Clear the payment request ID (call after payment success/failure)
 */
export function clearPaymentRequestId(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("payment_request_id");
    sessionStorage.removeItem("payment_idempotency_key");
  }
}

/**
 * Generate stable idempotency key for subscription creation
 * Pattern: hash of user_id + plan_name + timestamp_bucket
 */
export function getIdempotencyKey(userId: string, planName: string): string {
  if (typeof window === "undefined") return "";

  const storageKey = "payment_idempotency_key";
  let key = sessionStorage.getItem(storageKey);

  if (!key) {
    // Create stable key based on user + plan
    // Include 5-minute bucket to allow retry after a while
    const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const data = `${userId}:${planName}:${bucket}`;
    key = `idem_${btoa(data)
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 24)}`;
    sessionStorage.setItem(storageKey, key);
  }

  return key;
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
    }),
  });

  return response.json();
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
// Plan Details
// =============================================================================

export const PLAN_DETAILS = {
  starter: {
    name: "Starter",
    price: 1499,
    aiResponses: 2500,
    features: [
      "2,500 AI Responses / month",
      "1 WhatsApp Number",
      "Up to 50 FAQs Training",
      "Basic Auto-Replies",
      "Live Chat Dashboard",
      "Email Support",
    ],
  },
  business: {
    name: "Business",
    price: 3999,
    aiResponses: 8000,
    features: [
      "8,000 AI Responses / month",
      "Up to 2 WhatsApp Numbers",
      "Up to 200 FAQs Training",
      "Broadcast Campaigns",
      "Template Message Builder",
      "Contact Management",
      "Basic Analytics Dashboard",
      "Chat Support",
    ],
  },
  pro: {
    name: "Pro",
    price: 8999,
    aiResponses: 25000,
    features: [
      "25,000 AI Responses / month",
      "Unlimited WhatsApp Numbers",
      "Unlimited FAQs Training",
      "Custom AI Personality Training",
      "Multi-Agent Team Inbox",
      "Advanced Workflow Automation",
      "API Access & Webhooks",
      "Advanced Analytics & Reports",
      "Priority Support + Onboarding",
    ],
  },
} as const;
