/**
 * Razorpay API Client
 * Handles subscription creation, verification, and status checks.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface RazorpayOrder {
  success: boolean;
  subscription_id: string;
  key_id: string;
  amount: number;
  currency: string;
  plan_name: string;
  error?: string;
}

interface SubscriptionStatus {
  success: boolean;
  has_subscription: boolean;
  subscription: {
    id: string;
    plan_name: "starter" | "business" | "pro";
    status: "pending" | "active" | "cancelled" | "expired" | "halted";
    ai_responses_limit: number;
    ai_responses_used: number;
    current_period_start: string;
    current_period_end: string;
  } | null;
  error?: string;
}

interface VerifyPaymentParams {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

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
  const response = await fetch(`${BACKEND_URL}/api/subscriptions/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId && { "X-User-Id": userId }),
    },
    body: JSON.stringify({
      plan_name: planName,
      customer_email: customerEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
    }),
  });

  return response.json();
}

/**
 * Verify a successful payment
 */
export async function verifyPayment(
  params: VerifyPaymentParams,
  userId?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${BACKEND_URL}/api/subscriptions/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
  const response = await fetch(`${BACKEND_URL}/api/subscriptions/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(userId && { "X-User-Id": userId }),
    },
  });

  return response.json();
}

/**
 * Cancel subscription at end of billing period
 */
export async function cancelSubscription(
  userId?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${BACKEND_URL}/api/subscriptions/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId && { "X-User-Id": userId }),
    },
  });

  return response.json();
}

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
    // Enable all payment methods (UPI, Cards, Netbanking, Wallets)
    method: {
      netbanking: true,
      card: true,
      upi: true,
      wallet: true,
    },
    handler: (response: any) => {
      options.onSuccess({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_subscription_id: response.razorpay_subscription_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: () => {
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

// Plan details for reference
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
