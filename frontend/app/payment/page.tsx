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
  const sessionCookie = cookieStore.get('flowauxi_session');

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    // Validate session with backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const response = await fetch(`${backendUrl}/api/auth/validate-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionToken: sessionCookie.value,
      }),
      // Short timeout to fail fast
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (!data.valid) {
      return null;
    }

    return {
      userId: data.userId,
      email: data.email,
      name: data.name,
      phone: data.phone,
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

// =============================================================================
// TENANT RESOLUTION
// =============================================================================

async function resolveTenant(): Promise<TenantInfo | null> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  // Domain mapping (must match backend domain_middleware.py)
  const domainMap: Record<string, string> = {
    'shop.flowauxi.com': 'shop',
    'marketing.flowauxi.com': 'marketing',
    'pages.flowauxi.com': 'showcase',
    'flowauxi.com': 'dashboard',
    'www.flowauxi.com': 'dashboard',
    'api.flowauxi.com': 'api',
    'localhost:3000': 'dashboard',
    'localhost:3001': 'shop',
    'localhost:3002': 'showcase',
    'localhost:3003': 'marketing',
    'localhost:3004': 'api',
  };

  const productDomain = domainMap[host];

  if (!productDomain) {
    return null;
  }

  return {
    domain: host,
    productDomain,
  };
}

// =============================================================================
// SERVER-SIDE PRICING FETCH
// =============================================================================

async function fetchPricing(
  tenant: TenantInfo,
  userSession: UserSession
): Promise<PricingData | null> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    
    // Server-side request includes user context and tenant
    const response = await fetch(
      `${backendUrl}/api/billing/pricing?domain=${tenant.productDomain}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userSession.userId,
          'X-Product-Domain': tenant.productDomain,
          'X-Request-Source': 'nextjs-server-component',
        },
        // Cache pricing for 5 minutes at server level
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      console.error('Pricing fetch failed:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Pricing fetch error:', error);
    return null;
  }
}

// =============================================================================
// SUBSCRIPTION STATE CHECK
// =============================================================================

async function checkSubscriptionState(
  userSession: UserSession,
  tenant: TenantInfo
): Promise<SubscriptionState> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    
    const response = await fetch(
      `${backendUrl}/api/billing/subscription-state?domain=${tenant.productDomain}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userSession.userId,
          'X-Product-Domain': tenant.productDomain,
        },
        // Short cache for subscription state
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      // Fail closed - assume they can't subscribe
      return {
        hasSubscription: false,
        hasActiveTrial: false,
        trialExpired: false,
        canSubscribe: false,
        reason: 'state_check_failed',
      };
    }

    return await response.json();
  } catch (error) {
    console.error('Subscription state check error:', error);
    return {
      hasSubscription: false,
      hasActiveTrial: false,
      trialExpired: false,
      canSubscribe: false,
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

  // If they have an active trial and aren't expired, redirect to dashboard
  if (subscriptionState.hasActiveTrial && !subscriptionState.trialExpired) {
    redirect('/dashboard');
  }

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
