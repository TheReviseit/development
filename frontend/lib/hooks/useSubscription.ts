"use client";

/**
 * useSubscription Hook
 * Manages subscription state and provides methods for subscription operations.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getSubscriptionStatus,
  createSubscription,
  verifyPayment,
  openRazorpayCheckout,
  cancelSubscription,
} from "../api/razorpay";

type PlanName = "starter" | "business" | "pro";

interface Subscription {
  id: string;
  plan_name: PlanName;
  status:
    | "pending"
    | "active"
    | "cancelled"
    | "expired"
    | "halted"
    | "processing"
    | "completed"
    | "failed";
  ai_responses_limit: number;
  ai_responses_used: number;
  current_period_start: string;
  current_period_end: string;
}

interface UseSubscriptionReturn {
  subscription: Subscription | null;
  isLoading: boolean;
  error: string | null;
  hasActiveSubscription: boolean;
  remainingResponses: number;
  usagePercentage: number;
  refetch: () => Promise<void>;
  subscribe: (
    planName: PlanName,
    userInfo: { email: string; name?: string; phone?: string },
  ) => Promise<boolean>;
  cancel: () => Promise<boolean>;
}

export function useSubscription(userId?: string): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getSubscriptionStatus(userId);

      if (result.success) {
        setSubscription(result.subscription);
      } else {
        setError(result.error || "Failed to fetch subscription");
      }
    } catch (err) {
      setError("Network error while fetching subscription");
      console.error("Subscription fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const subscribe = useCallback(
    async (
      planName: PlanName,
      userInfo: { email: string; name?: string; phone?: string },
    ): Promise<boolean> => {
      setError(null);

      try {
        // Create subscription order
        const order = await createSubscription(
          planName,
          userInfo.email,
          userInfo.name,
          userInfo.phone,
          userId,
        );

        if (!order.success) {
          setError(order.error || "Failed to create subscription");
          return false;
        }

        // Open Razorpay checkout
        return new Promise((resolve) => {
          openRazorpayCheckout({
            subscriptionId: order.subscription_id,
            keyId: order.key_id,
            planName: order.plan_name,
            amount: order.amount,
            customerEmail: userInfo.email,
            customerName: userInfo.name,
            customerPhone: userInfo.phone,
            onSuccess: async (response) => {
              // Verify payment
              const verification = await verifyPayment(
                {
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
                userId,
              );

              if (verification.success) {
                await fetchSubscription();
                resolve(true);
              } else {
                setError(verification.error || "Payment verification failed");
                resolve(false);
              }
            },
            onError: (err) => {
              setError(err.description || "Payment failed");
              resolve(false);
            },
            onClose: () => {
              resolve(false);
            },
          });
        });
      } catch (err) {
        setError("Failed to initiate payment");
        console.error("Subscribe error:", err);
        return false;
      }
    },
    [userId, fetchSubscription],
  );

  const cancel = useCallback(async (): Promise<boolean> => {
    setError(null);

    try {
      const result = await cancelSubscription(userId);

      if (result.success) {
        await fetchSubscription();
        return true;
      } else {
        setError(result.error || "Failed to cancel subscription");
        return false;
      }
    } catch (err) {
      setError("Network error while cancelling subscription");
      console.error("Cancel error:", err);
      return false;
    }
  }, [userId, fetchSubscription]);

  const hasActiveSubscription = subscription?.status === "active";

  const remainingResponses = subscription
    ? subscription.ai_responses_limit - subscription.ai_responses_used
    : 0;

  const usagePercentage = subscription
    ? Math.round(
        (subscription.ai_responses_used / subscription.ai_responses_limit) *
          100,
      )
    : 0;

  return {
    subscription,
    isLoading,
    error,
    hasActiveSubscription,
    remainingResponses,
    usagePercentage,
    refetch: fetchSubscription,
    subscribe,
    cancel,
  };
}
