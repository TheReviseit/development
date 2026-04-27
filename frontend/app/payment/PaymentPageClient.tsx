/**
 * Payment Page - Client Component
 * ================================
 * Client-side interactivity for the payment page.
 * 
 * IMPORTANT: This component does NOT handle auth or pricing logic.
 * All security-critical decisions are made server-side.
 * This component only handles UI interactions and payment flow.
 * 
 * @version 2.0.0
 * @securityLevel FAANG-Production
 * @clientComponent
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import logo from '@/public/logo.png';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface UserSession {
  userId: string;
  email: string;
  name?: string;
  phone?: string;
}

interface TenantInfo {
  domain: string;
  productDomain: string;
}

interface PricingPlan {
  id: string;
  name: string;
  slug: string;
  price: number;
  priceDisplay: string;
  currency: string;
  description: string;
  features: string[];
  popular?: boolean;
}

interface PricingData {
  domain: string;
  displayName: string;
  plans: PricingPlan[];
}

interface SubscriptionState {
  hasSubscription: boolean;
  hasActiveTrial: boolean;
  trialExpired: boolean;
  canSubscribe: boolean;
  reason?: string;
}

interface PaymentPageClientProps {
  user: UserSession;
  tenant: TenantInfo;
  pricing: PricingData;
  reason: string;
  subscriptionState: SubscriptionState;
}

// =============================================================================
// REASON MAPPING
// =============================================================================

const REASON_CONFIG: Record<string, { headline: string; badge: string; color: string }> = {
  trial_expired: {
    headline: 'Your free trial has ended',
    badge: 'Trial Expired',
    color: '#ef4444',
  },
  expired: {
    headline: 'Renew your subscription',
    badge: 'Subscription Expired',
    color: '#ef4444',
  },
  past_due: {
    headline: 'Update your payment method',
    badge: 'Payment Overdue',
    color: '#f59e0b',
  },
  suspended: {
    headline: 'Restore your access',
    badge: 'Account Suspended',
    color: '#ef4444',
  },
  cancelled: {
    headline: 'Reactivate your subscription',
    badge: 'Subscription Cancelled',
    color: '#6b7280',
  },
  no_subscription: {
    headline: 'Choose a plan to get started',
    badge: 'No Active Plan',
    color: '#3b82f6',
  },
};

// =============================================================================
// DOMAIN CONFIGURATION
// =============================================================================

const DOMAIN_CONFIG: Record<string, { displayName: string; themeColor: string }> = {
  shop: {
    displayName: 'Shop',
    themeColor: '#ef4444',
  },
  marketing: {
    displayName: 'Marketing Hub',
    themeColor: '#10b981',
  },
  showcase: {
    displayName: 'Portfolio',
    themeColor: '#3b82f6',
  },
  api: {
    displayName: 'API Console',
    themeColor: '#8b5cf6',
  },
  dashboard: {
    displayName: 'Dashboard',
    themeColor: '#6366f1',
  },
};

// =============================================================================
// CHECKOUT FLOW
// =============================================================================

async function createCheckoutSession(
  planSlug: string,
  idempotencyKey: string
): Promise<{
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  keyId?: string;
  pendingSubscriptionId?: string;
  error?: string;
}> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planSlug,
          idempotencyKey,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        // Retry only on transient gateway/service errors
        if ((response.status === 502 || response.status === 503) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }

        if (response.status === 429) {
          return { success: false, error: 'Too many attempts. Please wait a moment.' };
        }
        if (response.status === 409) {
          return { success: false, error: 'You already have an active subscription.' };
        }
        if (response.status === 503) {
          return { success: false, error: 'Payment service temporarily unavailable. Please try again.' };
        }

        return { success: false, error: (error as any).message || 'Failed to create checkout session.' };
      }

      const data = await response.json();
      return {
        success: true,
        checkoutUrl: data.checkoutUrl,
        sessionId: data.sessionId,
        keyId: data.keyId,
        pendingSubscriptionId: data.pendingSubscriptionId,
      };
    } catch (error) {
      // Retry on network/abort errors
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      console.error('Checkout session error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  return { success: false, error: 'Failed to create checkout session.' };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PaymentPageClient({
  user,
  tenant,
  pricing,
  reason,
  subscriptionState,
}: PaymentPageClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [fallbackCheckoutUrl, setFallbackCheckoutUrl] = useState<string | null>(null);
  const verifyRequestId = useRef<string>(`pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const domainConfig = DOMAIN_CONFIG[tenant.productDomain] || DOMAIN_CONFIG.dashboard;
  const reasonConfig = REASON_CONFIG[reason] || REASON_CONFIG.no_subscription;

  // Load Razorpay script once (Checkout.js modal)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.Razorpay) {
      setRazorpayLoaded(true);
      return;
    }
    if (document.getElementById('razorpay-sdk')) {
      const check = setInterval(() => {
        if (window.Razorpay) {
          setRazorpayLoaded(true);
          clearInterval(check);
        }
      }, 100);
      return () => clearInterval(check);
    }
    const script = document.createElement('script');
    script.id = 'razorpay-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => {
      setError('Failed to load payment system. Please refresh and try again.');
      setRazorpayLoaded(false);
    };
    document.body.appendChild(script);
  }, []);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const verifyWithRetry = useCallback(
    async (payload: {
      razorpay_subscription_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }, sessionId: string) => {
      const maxRetries = 3;
      let attempt = 0;

      while (attempt < maxRetries) {
        try {
          const idempotencyKey =
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID())
              ? crypto.randomUUID()
              : `${user.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          const res = await fetch('/api/billing/verify-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
              'X-Request-Id': verifyRequestId.current,
            },
            body: JSON.stringify(payload),
          });

          const data = await res.json().catch(() => ({}));

          // Success (or already activated)
          if (res.ok && data?.success) {
            router.push(`/payment/status?subscription_id=${encodeURIComponent(sessionId)}`);
            return;
          }

          const code = data?.code as string | undefined;

          // Transient: gateway unavailable / concurrent verify → backoff + retry
          if (res.status === 202 || res.status === 429 || code === 'RAZORPAY_UNAVAILABLE' || code === 'CONCURRENT_REQUEST') {
            attempt += 1;
            const backoffMs = Math.min(4000, 1000 * 2 ** attempt);
            await sleep(backoffMs);
            continue;
          }

          // Permanent failure
          setError(data?.message || 'Payment verification failed. Please contact support.');
          router.push(`/payment/status?subscription_id=${encodeURIComponent(sessionId)}`);
          return;
        } catch (e) {
          attempt += 1;
          const backoffMs = Math.min(4000, 1000 * 2 ** attempt);
          await sleep(backoffMs);
        }
      }

      // After max retries, fall back to status polling (webhook path)
      router.push(`/payment/status?subscription_id=${encodeURIComponent(sessionId)}`);
    },
    [router, user.userId],
  );

  const handleSubscribe = useCallback(async (plan: PricingPlan) => {
    setIsLoading(plan.slug);
    setError(null);
    setFallbackCheckoutUrl(null);

    // Generate idempotency key
    const idempotencyKey = `${user.userId}_${plan.slug}_${tenant.productDomain}_${Date.now()}`;

    const result = await createCheckoutSession(plan.slug, idempotencyKey);

    if (!result.success || !result.sessionId || !result.keyId) {
      setError(result.error || 'Failed to start checkout. Please try again.');
      setIsLoading(null);
      return;
    }

    // Store hosted checkout URL as a fallback when Checkout.js is blocked
    if (result.checkoutUrl) setFallbackCheckoutUrl(result.checkoutUrl);

    // Known issue: Razorpay Checkout.js can break on legacy Android WebViews/older browsers.
    // When detected, force hosted checkout + status polling (webhook/verify will settle).
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const androidMatch = ua.match(/Android\s(\d+)\./i);
    const androidMajor = androidMatch ? Number(androidMatch[1]) : null;
    const legacyAndroid = androidMajor !== null && androidMajor <= 7;

    if (legacyAndroid && result.checkoutUrl) {
      try {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer');
      } catch {
        window.location.href = result.checkoutUrl;
        return;
      }
      router.push(`/payment/status?subscription_id=${encodeURIComponent(result.sessionId)}`);
      setIsLoading(null);
      return;
    }

    if (!razorpayLoaded || !window.Razorpay) {
      setError('Payment system is still loading. Please wait a moment and try again.');
      setIsLoading(null);
      return;
    }

    const sessionId = result.sessionId;

    const options = {
      key: result.keyId,
      subscription_id: sessionId,
      name: 'Flowauxi',
      description: `${plan.name} Plan Subscription`,
      image: '/logo.png',
      handler: async function (response: any) {
        setIsLoading('verifying');
        await verifyWithRetry(
          {
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
          sessionId,
        );
      },
      modal: {
        ondismiss: function () {
          setIsLoading(null);
          if (result.checkoutUrl) {
            setError(
              'Checkout was closed. If you saw "This content is blocked", disable ad blockers / tracker protection or use the secure checkout page below.',
            );
          }
        },
      },
      theme: {
        color: domainConfig.themeColor,
      },
      notes: {
        product_domain: tenant.productDomain,
      },
    };

    try {
      const rzp = new window.Razorpay(options);

      // If the browser/network blocks Razorpay resources, some environments surface
      // as a payment.failed event. Capture it and show a clean fallback.
      if (typeof rzp?.on === 'function') {
        rzp.on('payment.failed', function (resp: any) {
          const reasonText =
            resp?.error?.description ||
            resp?.error?.reason ||
            resp?.error?.source ||
            'Payment failed or was blocked by the browser/network.';

          setError(
            `${reasonText} ${result.checkoutUrl ? 'You can also open the secure checkout page below.' : ''}`,
          );
          setIsLoading(null);
        });
      }

      rzp.open();
    } catch (e) {
      console.error('Razorpay open error:', e);
      setError(
        `Failed to open payment window. ${result.checkoutUrl ? 'You can also open the secure checkout page below.' : ''}`,
      );
      setIsLoading(null);
    }
  }, [user.userId, tenant.productDomain, domainConfig.themeColor, razorpayLoaded, verifyWithRetry]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 w-full bg-white/92 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src={logo} alt="Flowauxi" width={32} height={32} />
            <span className="text-xl font-bold text-gray-900">Flowauxi</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Dashboard
            </Link>
            <button
              onClick={() => setShowSupport(true)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Support
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="w-full py-12 px-6 text-center">
        {/* Status Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide mb-6"
          style={{
            backgroundColor: `${reasonConfig.color}20`,
            color: reasonConfig.color,
            border: `1px solid ${reasonConfig.color}40`,
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: reasonConfig.color }}
          />
          {reasonConfig.badge}
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
          {reasonConfig.headline}
        </h1>

        {/* Subtext */}
        <p className="text-gray-600 max-w-xl mx-auto text-lg">
          Choose a plan for {domainConfig.displayName} to continue using all features.
        </p>

        {/* User Info */}
        <p className="text-sm text-gray-500 mt-4">
          Signed in as <span className="font-medium text-gray-700">{user.email}</span>
        </p>
      </div>

	      {/* Error Banner */}
	      {error && (
	        <div className="max-w-4xl mx-auto px-6 mb-6">
	          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
	            <div className="text-red-700 text-sm">
	              <p>{error}</p>
	              {fallbackCheckoutUrl && (
	                <p className="mt-2">
	                  <a
	                    href={fallbackCheckoutUrl}
	                    target="_blank"
	                    rel="noreferrer"
	                    className="underline font-semibold"
	                  >
	                    Open secure checkout page
	                  </a>
	                </p>
	              )}
	            </div>
	            <button
	              onClick={() => setError(null)}
	              className="text-red-500 hover:text-red-700"
	            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="flex-1 max-w-6xl mx-auto px-6 pb-16">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-8 text-center">
          Select your plan
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {pricing.plans.map((plan) => (
            <div
              key={plan.slug}
              className={`relative bg-white rounded-2xl p-6 border-2 transition-all hover:shadow-lg ${
                plan.popular
                  ? 'border-blue-500 shadow-lg scale-105'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-gray-900">
                    {plan.priceDisplay}
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-gray-600">
                    <svg
                      className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan)}
                disabled={isLoading !== null || !subscriptionState.canSubscribe}
                className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400'
                }`}
              >
                {isLoading === plan.slug ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Subscribe'
                )}
              </button>
            </div>
          ))}
        </div>

        {!subscriptionState.canSubscribe && (
          <div className="mt-8 text-center">
            <p className="text-amber-600 text-sm">
              Unable to subscribe at this time. Reason: {subscriptionState.reason}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Please contact support for assistance.
            </p>
          </div>
        )}
      </div>

      {/* Support Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSupport(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Need Help?</h2>
            <p className="text-gray-600 text-sm mb-4">
              Our support team is here to assist you.
            </p>
            <div className="space-y-3">
              <a
                href="mailto:support@flowauxi.com"
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  ✉️
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Email Support</p>
                  <p className="text-sm text-gray-500">support@flowauxi.com</p>
                </div>
              </a>
            </div>
            <button
              onClick={() => setShowSupport(false)}
              className="mt-4 w-full py-2 text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 text-center">
        <p className="text-sm text-gray-500">
          Payments processed securely via{' '}
          <span className="font-medium text-gray-700">Razorpay</span>
        </p>
      </footer>
    </div>
  );
}
