/**
 * SubscriptionProvider — Centralized Subscription State Context
 * ==============================================================
 *
 * Wraps the dashboard layout to provide subscription state to all children.
 *
 * Architecture:
 *   - Uses useSubscription() hook (React Query backed)
 *   - Exposes context via useSubscriptionContext()
 *   - Dashboard layout reads isLocked/lockReason for BillingLockScreen gate
 *   - Any child component can check hasFeatureAccess()
 *
 * Usage:
 *   // In layout:
 *   <SubscriptionProvider>
 *     <Dashboard />
 *   </SubscriptionProvider>
 *
 *   // In any child:
 *   const { isLocked, hasFeatureAccess } = useSubscriptionContext();
 */

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSubscription, type UseSubscriptionReturn } from "@/app/hooks/useSubscription";

// =============================================================================
// CONTEXT
// =============================================================================

const SubscriptionContext = createContext<UseSubscriptionReturn | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const subscription = useSubscription();

  return (
    <SubscriptionContext.Provider value={subscription}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Access subscription state from any component inside SubscriptionProvider.
 *
 * @throws if used outside SubscriptionProvider
 */
export function useSubscriptionContext(): UseSubscriptionReturn {
  const context = useContext(SubscriptionContext);

  if (!context) {
    throw new Error(
      "useSubscriptionContext must be used within a SubscriptionProvider. " +
        "Wrap your component tree with <SubscriptionProvider>."
    );
  }

  return context;
}
