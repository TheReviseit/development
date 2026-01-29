"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  notes?: string;
}

interface Order {
  id: string;
  user_id: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total_quantity: number;
  status: "pending" | "confirmed" | "processing" | "completed" | "cancelled";
  source: "ai" | "manual";
  notes?: string;
  created_at: string;
  updated_at?: string;
}

interface UseRealtimeOrdersOptions {
  userId: string | null;
  onInsert?: (order: Order) => void;
  onUpdate?: (order: Order) => void;
  onDelete?: (oldOrder: { id: string }) => void;
  enabled?: boolean;
  /**
   * Enable polling fallback when realtime fails.
   * This ensures updates are still received even if WebSocket is blocked.
   */
  enablePollingFallback?: boolean;
  /**
   * Polling interval in ms (default: 10000 = 10 seconds)
   */
  pollingIntervalMs?: number;
}

/**
 * Hook to subscribe to real-time order changes.
 *
 * Uses Supabase Realtime to listen for INSERT, UPDATE, DELETE events
 * on the orders table filtered by user_id.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Polling fallback when WebSocket fails
 * - Connection state management
 * - Graceful cleanup
 */
export function useRealtimeOrders({
  userId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
  enablePollingFallback = true,
  pollingIntervalMs = 10000,
}: UseRealtimeOrdersOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isUsingPolling, setIsUsingPolling] = useState(false);

  // Retry state
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 3;
  const BASE_RETRY_DELAY = 2000; // 2 seconds

  // Polling state
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<string | null>(null);

  // Store callbacks in refs to prevent subscription recreation
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  // Update refs when callbacks change
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  /**
   * Parse order items if they're stored as JSON string
   */
  const parseOrder = useCallback((order: any): Order => {
    if (typeof order.items === "string") {
      try {
        order.items = JSON.parse(order.items);
      } catch (e) {
        console.error("Failed to parse items:", e);
        order.items = [];
      }
    }
    return order as Order;
  }, []);

  /**
   * Start polling fallback mode
   */
  const startPolling = useCallback(() => {
    if (!userId || pollingIntervalRef.current) return;

    console.log("🔄 [Realtime] Starting polling fallback mode");
    setIsUsingPolling(true);

    const poll = async () => {
      try {
        // Fetch orders updated since last poll
        let query = supabase
          .from("orders")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(50);

        if (lastFetchTimeRef.current) {
          query = query.gt("updated_at", lastFetchTimeRef.current);
        }

        const { data, error } = await query;

        if (error) {
          console.error("🔄 [Realtime] Polling error:", error);
          return;
        }

        if (data && data.length > 0) {
          console.log(`🔄 [Realtime] Polled ${data.length} updated orders`);

          // Update last fetch time
          lastFetchTimeRef.current = new Date().toISOString();

          // Trigger update callbacks for each order
          data.forEach((order) => {
            if (onUpdateRef.current) {
              onUpdateRef.current(parseOrder(order));
            }
          });
        }
      } catch (e) {
        console.error("🔄 [Realtime] Polling exception:", e);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    pollingIntervalRef.current = setInterval(poll, pollingIntervalMs);
  }, [userId, pollingIntervalMs, parseOrder]);

  /**
   * Stop polling fallback
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log("🔄 [Realtime] Stopping polling");
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setIsUsingPolling(false);
    }
  }, []);

  /**
   * Cleanup subscription and polling
   */
  const cleanup = useCallback(() => {
    // Clear retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Stop polling
    stopPolling();

    // Remove realtime channel
    if (channelRef.current) {
      console.log("🔌 Unsubscribing from orders realtime channel");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }

    // Reset retry count
    retryCountRef.current = 0;
  }, [stopPolling]);

  /**
   * Subscribe to realtime changes with retry logic
   */
  const subscribe = useCallback(() => {
    if (!userId) return;

    // Prevent duplicate subscriptions
    if (channelRef.current) {
      return;
    }

    console.log("🔌 Setting up realtime subscription for orders");
    console.log(`   User ID: ${userId}`);
    console.log(
      `   Retry attempt: ${retryCountRef.current + 1}/${MAX_RETRIES}`,
    );

    const channelName = `orders:${userId}`;

    const channel = supabase
      .channel(channelName, {
        config: {
          // Faster heartbeat to detect connection issues sooner
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("📦 New order received:", payload.new);

          // Client-side filtering
          if (userId && (payload.new as any).user_id !== userId) {
            return;
          }

          if (onInsertRef.current && payload.new) {
            onInsertRef.current(parseOrder(payload.new));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("📦 Order updated:", payload.new);

          // Client-side filtering
          if (userId && (payload.new as any).user_id !== userId) {
            return;
          }

          if (onUpdateRef.current && payload.new) {
            onUpdateRef.current(parseOrder(payload.new));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          console.log("📦 Order deleted:", payload.old);

          if (onDeleteRef.current && payload.old) {
            onDeleteRef.current({ id: (payload.old as { id: string }).id });
          }
        },
      )
      .subscribe((status, err) => {
        console.log(
          `🔌 Orders realtime subscription status: ${status}`,
          err || "",
        );

        if (status === "SUBSCRIBED") {
          console.log("✅ Successfully subscribed to orders updates");
          setIsConnected(true);
          setConnectionError(null);
          retryCountRef.current = 0; // Reset retry count on success

          // Stop polling if we successfully connected
          stopPolling();
        } else if (status === "CHANNEL_ERROR") {
          const errorMessage =
            err?.message || "Failed to connect to realtime updates";
          console.warn(`⚠️ Realtime subscription error: ${errorMessage}`);

          setIsConnected(false);

          // Retry logic with exponential backoff
          if (retryCountRef.current < MAX_RETRIES) {
            const delay = BASE_RETRY_DELAY * Math.pow(2, retryCountRef.current);
            console.log(
              `🔄 Retrying in ${delay / 1000}s (attempt ${retryCountRef.current + 1}/${MAX_RETRIES})`,
            );

            retryCountRef.current++;

            // Clean up current channel before retry
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }

            retryTimeoutRef.current = setTimeout(() => {
              subscribe();
            }, delay);
          } else {
            // Max retries reached - fall back to polling
            console.error("❌ Max retries reached for realtime subscription");
            setConnectionError(
              `Realtime unavailable. ${enablePollingFallback ? "Using polling fallback." : ""}`,
            );

            if (enablePollingFallback) {
              startPolling();
            }
          }
        } else if (status === "TIMED_OUT") {
          console.error("⏱️ Connection timed out");
          setIsConnected(false);
          setConnectionError("Connection timed out. Will retry...");

          // Retry on timeout
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;

            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }

            retryTimeoutRef.current = setTimeout(() => {
              subscribe();
            }, BASE_RETRY_DELAY);
          } else if (enablePollingFallback) {
            startPolling();
          }
        } else if (status === "CLOSED") {
          console.log("🔌 Channel closed");
          setIsConnected(false);
        }
      });

    channelRef.current = channel;
  }, [userId, parseOrder, stopPolling, startPolling, enablePollingFallback]);

  useEffect(() => {
    if (!enabled || !userId) {
      cleanup();
      return;
    }

    subscribe();

    return cleanup;
  }, [userId, enabled, cleanup, subscribe]);

  // Expose a method to manually refresh (useful when coming back from background)
  const refresh = useCallback(() => {
    cleanup();
    retryCountRef.current = 0;
    subscribe();
  }, [cleanup, subscribe]);

  return {
    isConnected,
    connectionError,
    isUsingPolling,
    cleanup,
    refresh,
  };
}
