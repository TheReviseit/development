/**
 * Payment Page - Server Component
 * ================================
 * FAANG-grade server-side rendered payment page with strict auth.
 * 
 * Security Features:
 * - Server-side auth validation (no client-side auth flash)
 * - Tenant resolution from Host header
 * - Server-side pricing fetch (no client-side pricing leakage)
 * - Subscription state validation
 * - No payment UI rendered for unauthenticated users
 * 
 * @version 2.0.0
 * @securityLevel FAANG-Production
 * @serverComponent
 */

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PaymentPageClient from './PaymentPageClient';

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

// =============================================================================
// SERVER-SIDE AUTH VALIDATION
// =============================================================================

async function validateSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  // CRITICAL: The auth system sets the cookie as 'session' (via Firebase Admin
  // createSessionCookie in auth/sync/route.ts), NOT 'flowauxi_session'.
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) {
    console.warn('[Payment] No session cookie found');
    return null;
  }

  try {
    // Use Firebase Admin SDK to verify session cookie (same pattern as verify-request.ts)
    const { verifySessionCookieSafe } = await import('@/lib/firebase-admin');
    const result = await verifySessionCookieSafe(sessionCookie, false); // false = skip revocation check for speed

    if (!result.success || !result.data) {
      console.warn('[Payment] Session cookie verification failed:', result.error);
      return null;
    }

    const decodedClaims = result.data;

    // Look up user in Supabase (same pattern as auth/sync)
    const { getUserByFirebaseUID } = await import('@/lib/supabase/queries');
    const user = await getUserByFirebaseUID(decodedClaims.uid);

    if (!user) {
      console.warn('[Payment] User not found in database for firebase_uid:', decodedClaims.uid);
      return null;
    }

    return {
      userId: user.id,
      email: user.email || decodedClaims.email || '',
      name: user.full_name || decodedClaims.name,
      phone: user.phone || decodedClaims.phone_number,
    };
  } catch (error) {
    console.error('[Payment] Session validation error:', error);
    return null;
  }
}

// =============================================================================
// TENANT RESOLUTION (uses centralized domain config)
// =============================================================================

async function resolveTenant(): Promise<TenantInfo | null> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  // Use the centralized domain resolution (single source of truth)
  const { resolveDomain } = await import('@/lib/domain/config');

  // Parse host into hostname and port
  const [hostname, port] = host.includes(':')
    ? [host.split(':')[0], host.split(':')[1]]
    : [host, undefined];

  const productDomain = resolveDomain(hostname, port);

  return {
    domain: host,
    productDomain,
  };
}

async function fetchPricing(
  tenant: TenantInfo,
  _userSession: UserSession
): Promise<PricingData | null> {
  try {
    // Use the existing pricing engine (same source of truth as onboarding-embedded)
    // This is a pure function — no network call needed
    const { getPricingForProduct } = await import('@/lib/pricing/pricing-engine');
    const { PRODUCT_REGISTRY } = await import('@/lib/product/registry');

    const product = PRODUCT_REGISTRY[tenant.productDomain as keyof typeof PRODUCT_REGISTRY];
    if (!product) {
      console.error(`[Payment] Unknown product domain: ${tenant.productDomain}`);
      return null;
    }

    const plans = getPricingForProduct(tenant.productDomain as any);

    return {
      domain: tenant.productDomain,
      displayName: product.name,
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.id,
        price: plan.price,
        priceDisplay: plan.priceDisplay,
        currency: plan.currency,
        description: plan.description,
        features: plan.features,
        popular: plan.popular,
      })),
    };
  } catch (error) {
    console.error('[Payment] Pricing fetch error:', error);
    return null;
  }
}

// =============================================================================
// SUBSCRIPTION STATE CHECK (direct Supabase queries matching billing-status)
// =============================================================================

async function checkSubscriptionState(
  userSession: UserSession,
  tenant: TenantInfo
): Promise<SubscriptionState> {
  try {
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Payment] Missing Supabase env vars');
      return {
        hasSubscription: false,
        hasActiveTrial: false,
        trialExpired: false,
        canSubscribe: true,
        reason: 'config_error',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const domain = tenant.productDomain;

    // 1. Check for paid subscription (mirrors billing-status API)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userSession.userId)
      .eq('product_domain', domain)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription) {
      const subStatus = subscription.status as string;
      // IMPORTANT: The payment page must NOT redirect away for pre-payment states
      // like pending/processing/created. Those can be created as part of the
      // checkout flow and would cause a redirect loop back to /dashboard.
      //
      // Redirect away only for truly entitled states (the user already has access).
      const ENTITLED_STATUSES = new Set([
        "active",
        "trialing",
        "trial",
        "grace_period",
        "completed",
      ]);

      let isEffectivelyActive = ENTITLED_STATUSES.has(subStatus);

      // Explicitly fail if active but past the period end
      if (subStatus === "active" && subscription.current_period_end) {
        if (new Date(subscription.current_period_end) < new Date()) {
          isEffectivelyActive = false;
        }
      }

      if (isEffectivelyActive) {
        return {
          hasSubscription: true,
          hasActiveTrial: false,
          trialExpired: false,
          canSubscribe: false,
          reason: `active_subscription_${subStatus}`,
        };
      }

      // Subscription exists but it's not entitled yet (or it's locked/failed).
      // Allow the user to subscribe/repay from this screen.
      return {
        hasSubscription: false,
        hasActiveTrial: false,
        trialExpired: false,
        canSubscribe: true,
        reason: `subscription_not_entitled_${subStatus}`,
      };
      
      // If we made it here, they have a sub but it's in a locked state 
      // (e.g. past_due, cancelled, expired, suspended, halted)
      // Therefore, they SHOULD be allowed to subscribe!
    }

    // 2. Check for active trial (mirrors billing-status API)
    const { data: trial } = await supabase
      .from('free_trials')
      .select('status, expires_at')
      .eq('user_id', userSession.userId)
      .eq('domain', domain)
      .in('status', ['active', 'expiring_soon'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (trial) {
      return {
        hasSubscription: false,
        hasActiveTrial: true,
        trialExpired: false,
        canSubscribe: true, // They CAN upgrade while on a trial
        reason: 'active_trial',
      };
    }

    // No subscription and no active trial → user can subscribe
    return {
      hasSubscription: false,
      hasActiveTrial: false,
      trialExpired: false,
      canSubscribe: true,
    };
  } catch (error) {
    console.error('[Payment] Subscription state check error:', error);
    // Fail OPEN for payment page — let them see pricing even if check fails
    return {
      hasSubscription: false,
      hasActiveTrial: false,
      trialExpired: false,
      canSubscribe: true,
      reason: 'state_check_error',
    };
  }
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

interface PaymentPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PaymentPage({ searchParams }: PaymentPageProps) {
  // Get search params
  const params = await searchParams;
  const reason = typeof params.reason === 'string' ? params.reason : 'expired';

  // =============================================================================
  // SERVER-SIDE AUTH GUARD
  // =============================================================================
  
  const userSession = await validateSession();

  if (!userSession) {
    // Not authenticated - redirect to login with return URL
    const returnUrl = encodeURIComponent(`/payment?reason=${reason}`);
    redirect(`/login?returnUrl=${returnUrl}`);
  }

  // =============================================================================
  // TENANT RESOLUTION
  // =============================================================================
  
  const tenant = await resolveTenant();

  if (!tenant) {
    // Invalid tenant - this should not happen if middleware is working
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600">Unknown domain. Please contact support.</p>
        </div>
      </div>
    );
  }

  // =============================================================================
  // SERVER-SIDE PRICING FETCH
  // =============================================================================
  
  const pricingData = await fetchPricing(tenant, userSession);

  if (!pricingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600">Failed to load pricing. Please try again.</p>
        </div>
      </div>
    );
  }

  // =============================================================================
  // SUBSCRIPTION STATE VALIDATION
  // =============================================================================
  
  const subscriptionState = await checkSubscriptionState(userSession, tenant);

  // If they already have an active subscription, redirect to dashboard
  if (subscriptionState.hasSubscription) {
    redirect('/dashboard');
  }

  // If they have an active trial and aren't expired, still allow payment page.
  // Users should be able to upgrade early (trial -> paid) without being bounced.

  // =============================================================================
  // RENDER PAYMENT PAGE
  // =============================================================================
  
  return (
    <PaymentPageClient
      user={userSession}
      tenant={tenant}
      pricing={pricingData}
      reason={reason}
      subscriptionState={subscriptionState}
    />
  );
}

// =============================================================================
// METADATA
// =============================================================================

export const metadata = {
  title: 'Upgrade Your Plan - Flowauxi',
  description: 'Choose the perfect plan for your business.',
  robots: {
    index: false,
    follow: false,
  },
};
