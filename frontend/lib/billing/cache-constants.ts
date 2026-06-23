/**
 * Shared Cache Constants (Phase D)
 * =================================
 * Single source of truth for all subscription-related React Query
 * cache keys, stale times, retry configurations, and custom event names.
 *
 * Every component that reads or writes subscription data MUST use
 * these constants. This ensures:
 *   1. Cache invalidation always hits the correct keys
 *   2. Stale times are consistent across the app
 *   3. Retry behavior is uniform
 *   4. Custom event names never drift
 */

// =============================================================================
// QUERY KEY FACTORIES
// =============================================================================
// Each factory returns the stable query key array for a given resource.
// Using factories (not raw arrays) ensures type safety and consistency.

export const subscriptionKeys = {
  all: ["subscription"] as const,
  status: (domain: string) => ["subscription", "status", domain] as const,
  upgradeOptions: (domain: string, billingCycle: string) =>
    ["subscription", "upgrade-options", domain, billingCycle] as const,
  pricing: (domain: string) => ["subscription", "pricing", domain] as const,
  checkoutStatus: (checkoutId: string) =>
    ["subscription", "checkout", checkoutId] as const,
  invoices: (domain: string) => ["subscription", "invoices", domain] as const,
  history: (subscriptionId: string) =>
    ["subscription", "history", subscriptionId] as const,
};

// =============================================================================
// STALE TIMES (in milliseconds)
// =============================================================================
// These control how often React Query refetches data from the server.
// Longer = fewer API calls, but slower UI updates after state changes.

export const STALE_TIMES = {
  /** Subscription status: 30s — balances freshness with API load */
  SUBSCRIPTION_STATUS: 30_000,
  /** Upgrade options/pricing: 30s — refresh soon after payment */
  UPGRADE_OPTIONS: 30_000,
  /** Pricing plans: 5 min — only changes when admin updates */
  PRICING: 5 * 60 * 1000,
  /** Checkout status polling: 300ms initial — exponential backoff in UI */
  CHECKOUT_POLL: 300,
  /** Invoice list: 10 min — historical data, rarely changes */
  INVOICES: 10 * 60 * 1000,
  /** Subscription history/events: 10 min — immutable audit trail */
  HISTORY: 10 * 60 * 1000,
} as const;

// =============================================================================
// CACHE INVALIDATION EVENTS (CustomEvent names)
// =============================================================================
// Components dispatch these events after mutating subscription state.
// Other components listen and invalidate their React Query caches.

export const SUBSCRIPTION_EVENTS = {
  /** Fired after any subscription state change (subscribe, upgrade, cancel) */
  UPDATED: "subscription-updated",
  /** Fired after a product trial is activated */
  PRODUCT_ACTIVATED: "product-activated",
  /** Fired after payment succeeds */
  PAYMENT_SUCCEEDED: "payment-succeeded",
  /** Fired when a 409 Conflict is resolved (user completes stale checkout) */
  CONFLICT_RESOLVED: "subscription-conflict-resolved",
} as const;

// =============================================================================
// CACHE INVALIDATION HELPERS
// =============================================================================
// Standard invalidation patterns so all components behave consistently.

export function invalidateSubscriptionCache(queryClient: any) {
  queryClient.invalidateQueries({
    queryKey: subscriptionKeys.all,
    refetchType: "active",
  });
}

export function invalidateUpgradeOptions(queryClient: any) {
  queryClient.invalidateQueries({
    queryKey: ["subscription", "upgrade-options"],
    refetchType: "active",
  });
}

export function invalidateSubscriptionStatus(queryClient: any) {
  queryClient.invalidateQueries({
    queryKey: ["subscription", "status"],
    refetchType: "active",
  });
}

// =============================================================================
// DISPATCH HELPERS
// =============================================================================
// Standardized CustomEvent dispatchers — ensures consistent event naming
// and prevents typos across the codebase.

export function dispatchSubscriptionUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EVENTS.UPDATED));
}

export function dispatchPaymentSucceeded() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EVENTS.PAYMENT_SUCCEEDED));
}

export function dispatchConflictResolved() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EVENTS.CONFLICT_RESOLVED));
}

// =============================================================================
// REACT QUERY DEFAULTS
// =============================================================================
// Spread these into useQuery calls for consistent behavior.

export const DEFAULT_QUERY_OPTIONS = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 2,
  retryDelay: (attempt: number) =>
    Math.min(1000 * Math.pow(2, attempt), 5000),
} as const;

export const POLLING_QUERY_OPTIONS = {
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: false,
  retry: 3,
} as const;
