/**
 * Billing API Client
 * ==================
 * Type-safe client for billing API endpoints.
 * 
 * Security:
 * - Automatically includes auth headers
 * - Handles 401 responses for token refresh
 * - Circuit breaker pattern for resilience
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { auth } from '@/src/firebase/firebase';

// =============================================================================
// TYPES
// =============================================================================

export interface PricingPlan {
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

export interface PricingData {
  domain: string;
  displayName: string;
  plans: PricingPlan[];
}

export interface SubscriptionState {
  hasSubscription: boolean;
  hasActiveTrial: boolean;
  trialExpired: boolean;
  canSubscribe: boolean;
  reason?: string;
}

export interface CheckoutSession {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
  idempotencyHit?: boolean;
  plan?: {
    name: string;
    amount: number;
    currency: string;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// =============================================================================
// AUTH TOKEN MANAGEMENT
// =============================================================================

/**
 * Get current Firebase ID token.
 * Forces refresh if token is about to expire.
 */
async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    // Force refresh to ensure token is valid
    return await user.getIdToken(true);
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * Handle 401 responses by refreshing token and retrying.
 */
async function handleAuthError<T>(
  requestFn: () => Promise<T>
): Promise<T> {
  try {
    return await requestFn();
  } catch (error: any) {
    if (error.status === 401) {
      // Token expired, refresh and retry
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true); // Force refresh
        return await requestFn();
      }
    }
    throw error;
  }
}

// =============================================================================
// API CLIENT
// =============================================================================

class BillingApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await getAuthToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const apiError: any = new Error(error.message || 'API request failed');
      apiError.status = response.status;
      apiError.code = error.error || 'UNKNOWN_ERROR';
      apiError.data = error;
      throw apiError;
    }
    
    return response.json();
  }
  
  /**
   * Fetch pricing for current domain.
   */
  async getPricing(): Promise<PricingData> {
    return handleAuthError(() => 
      this.request<PricingData>('/api/billing/pricing')
    );
  }
  
  /**
   * Get user's subscription state.
   */
  async getSubscriptionState(): Promise<SubscriptionState> {
    return handleAuthError(() => 
      this.request<SubscriptionState>('/api/billing/subscription-state')
    );
  }
  
  /**
   * Create checkout session for subscription.
   */
  async createCheckoutSession(
    planSlug: string,
    idempotencyKey: string
  ): Promise<CheckoutSession> {
    return handleAuthError(() => 
      this.request<CheckoutSession>('/api/billing/checkout-session', {
        method: 'POST',
        body: JSON.stringify({
          planSlug,
          idempotencyKey,
        }),
      })
    );
  }
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const billingApi = new BillingApiClient();

// =============================================================================
// CIRCUIT BREAKER (Client-side)
// =============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  };
  
  private readonly threshold = 5;
  private readonly timeout = 30000; // 30 seconds
  
  canExecute(): boolean {
    if (this.state.state === 'closed') return true;
    
    if (this.state.state === 'open') {
      const now = Date.now();
      if (now - this.state.lastFailure > this.timeout) {
        this.state.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return true;
  }
  
  recordSuccess(): void {
    this.state.failures = 0;
    this.state.state = 'closed';
  }
  
  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailure = Date.now();
    
    if (this.state.failures >= this.threshold) {
      this.state.state = 'open';
    }
  }
}

export const billingCircuitBreaker = new CircuitBreaker();
