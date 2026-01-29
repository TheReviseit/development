"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  RealtimeChannel,
  REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";

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
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "polling";

interface ConnectionState {
  status: ConnectionStatus;
  error: string | null;
  isUsingPolling: boolean;
  retryCount: number;
  lastSuccessfulConnection: Date | null;
}

/**
 * World-class hook for real-time order subscriptions with Supabase.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Intelligent polling fallback when WebSocket is unavailable
 * - Connection state management with detailed status tracking
 * - Graceful degradation and error recovery
 * - Memory leak prevention
 * - Performance optimized with proper ref management
 * - Network resilience with visibility API integration
 * - Comprehensive error handling and logging
 */
export function useRealtimeOrders({
  userId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
  enablePollingFallback = true,
  pollingIntervalMs = 10000,
  debug = false,
}: UseRealtimeOrdersOptions) {
  // Channel and connection management
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "disconnected",
    error: null,
    isUsingPolling: false,
    retryCount: 0,
    lastSuccessfulConnection: null,
  });

  // Retry configuration
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRIES = 5;
  const BASE_RETRY_DELAY = 1000; // 1 second
  const MAX_RETRY_DELAY = 30000; // 30 seconds

  // Polling state
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTimeRef = useRef<string | null>(null);
  const pollingErrorCountRef = useRef(0);
  const MAX_POLLING_ERRORS = 3;

  // Connection tracking
  const connectionAttemptRef = useRef(0);
  const isCleaningUpRef = useRef(false);
  const mountedRef = useRef(true);

  // Store callbacks in refs to prevent subscription recreation
  const callbacksRef = useRef({
    onInsert,
    onUpdate,
    onDelete,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onInsert, onUpdate, onDelete };
  }, [onInsert, onUpdate, onDelete]);

  /**
   * Debug logging helper
   */
  const log = useCallback(
    (message: string, data?: any) => {
      if (debug) {
        console.log(`[RealtimeOrders] ${message}`, data || "");
      }
    },
    [debug],
  );

  /**
   * Error logging helper
   */
  const logError = useCallback((message: string, error?: any) => {
    console.error(`[RealtimeOrders] ${message}`, error || "");
  }, []);

  /**
   * Update connection state safely
   */
  const updateConnectionState = useCallback(
    (updates: Partial<ConnectionState>) => {
      if (!mountedRef.current) return;

      setConnectionState((prev) => ({
        ...prev,
        ...updates,
      }));
    },
    [],
  );

  /**
   * Parse order items if they're stored as JSON string
   */
  const parseOrder = useCallback(
    (order: any): Order => {
      if (typeof order.items === "string") {
        try {
          order.items = JSON.parse(order.items);
        } catch (e) {
          logError("Failed to parse order items", e);
          order.items = [];
        }
      }
      return order as Order;
    },
    [logError],
  );

  /**
   * Fetch initial data to populate cache
   */
  const fetchInitialOrders = useCallback(async () => {
    if (!userId) return;

    try {
      log("Fetching initial orders");

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        logError("Error fetching initial orders", error);
        return;
      }

      if (data && data.length > 0) {
        lastFetchTimeRef.current = data[0].updated_at || data[0].created_at;
        log("Initial fetch complete", { count: data.length });
      }
    } catch (e) {
      logError("Exception during initial fetch", e);
    }
  }, [userId, log, logError]);

  /**
   * Start polling fallback mode
   */
  const startPolling = useCallback(() => {
    if (!userId || pollingIntervalRef.current || isCleaningUpRef.current)
      return;

    log("🔄 Starting polling fallback mode");

    updateConnectionState({
      status: "polling",
      isUsingPolling: true,
      error: null,
    });

    const poll = async () => {
      if (isCleaningUpRef.current || !mountedRef.current) return;

      try {
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
          pollingErrorCountRef.current++;
          logError("Polling error", error);

          // If too many polling errors, stop polling
          if (pollingErrorCountRef.current >= MAX_POLLING_ERRORS) {
            logError("Max polling errors reached, stopping polling");
            stopPolling();
            updateConnectionState({
              status: "error",
              error: "Polling failed repeatedly. Please refresh the page.",
            });
          }
          return;
        }

        // Reset error count on success
        pollingErrorCountRef.current = 0;

        if (data && data.length > 0) {
          log(`Polled ${data.length} updated orders`);

          // Update last fetch time to the most recent update
          const mostRecent = data[0].updated_at || data[0].created_at;
          lastFetchTimeRef.current = mostRecent;

          // Trigger update callbacks for each order
          data.forEach((order) => {
            if (callbacksRef.current.onUpdate) {
              callbacksRef.current.onUpdate(parseOrder(order));
            }
          });
        }
      } catch (e) {
        pollingErrorCountRef.current++;
        logError("Polling exception", e);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    pollingIntervalRef.current = setInterval(poll, pollingIntervalMs);
  }, [
    userId,
    pollingIntervalMs,
    parseOrder,
    log,
    logError,
    updateConnectionState,
  ]);

  /**
   * Stop polling fallback
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      log("🔄 Stopping polling");
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      pollingErrorCountRef.current = 0;

      updateConnectionState({
        isUsingPolling: false,
      });
    }
  }, [log, updateConnectionState]);

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  const getRetryDelay = useCallback((attemptNumber: number): number => {
    const exponentialDelay = Math.min(
      BASE_RETRY_DELAY * Math.pow(2, attemptNumber),
      MAX_RETRY_DELAY,
    );
    // Add jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    return Math.floor(exponentialDelay + jitter);
  }, []);

  /**
   * Cleanup all subscriptions and timers
   */
  const cleanup = useCallback(() => {
    isCleaningUpRef.current = true;

    log("🧹 Cleaning up realtime subscription");

    // Clear retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Stop polling
    stopPolling();

    // Remove realtime channel
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (e) {
        logError("Error removing channel", e);
      }
      channelRef.current = null;
    }

    updateConnectionState({
      status: "disconnected",
      retryCount: 0,
    });

    isCleaningUpRef.current = false;
  }, [log, logError, stopPolling, updateConnectionState]);

  /**
   * Subscribe to realtime changes with intelligent retry logic
   */
  const subscribe = useCallback(() => {
    if (!userId || isCleaningUpRef.current || !mountedRef.current) {
      return;
    }

    // Prevent duplicate subscriptions
    if (channelRef.current) {
      log("Subscription already exists, skipping");
      return;
    }

    const currentAttempt = ++connectionAttemptRef.current;
    const retryCount = connectionState.retryCount;

    log("🔌 Setting up realtime subscription", {
      userId,
      attempt: currentAttempt,
      retryCount,
    });

    updateConnectionState({
      status: retryCount > 0 ? "reconnecting" : "connecting",
    });

    const channelName = `orders:user_${userId}:${Date.now()}`;

    try {
      const channel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "orders",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!mountedRef.current) return;

            log("📦 New order received", payload.new);

            if (callbacksRef.current.onInsert && payload.new) {
              callbacksRef.current.onInsert(parseOrder(payload.new));
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!mountedRef.current) return;

            log("📦 Order updated", payload.new);

            if (callbacksRef.current.onUpdate && payload.new) {
              callbacksRef.current.onUpdate(parseOrder(payload.new));
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "orders",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (!mountedRef.current) return;

            log("📦 Order deleted", payload.old);

            if (callbacksRef.current.onDelete && payload.old) {
              callbacksRef.current.onDelete({
                id: (payload.old as { id: string }).id,
              });
            }
          },
        )
        .subscribe(async (status, err) => {
          if (!mountedRef.current || isCleaningUpRef.current) return;

          log(`🔌 Subscription status: ${status}`, err);

          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            log("✅ Successfully subscribed to orders updates");

            updateConnectionState({
              status: "connected",
              error: null,
              retryCount: 0,
              lastSuccessfulConnection: new Date(),
            });

            // Stop polling if we successfully connected
            stopPolling();

            // Fetch initial data to sync state
            await fetchInitialOrders();
          } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
            const errorMessage =
              err?.message || "Failed to connect to realtime updates";
            logError(`⚠️ Realtime subscription error: ${errorMessage}`, err);

            updateConnectionState({
              status: "error",
              error: errorMessage,
            });

            // Clean up current channel before retry
            if (channelRef.current) {
              try {
                supabase.removeChannel(channelRef.current);
              } catch (e) {
                logError("Error removing failed channel", e);
              }
              channelRef.current = null;
            }

            // Retry logic with exponential backoff
            if (retryCount < MAX_RETRIES) {
              const delay = getRetryDelay(retryCount);
              log(
                `🔄 Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
              );

              updateConnectionState({
                retryCount: retryCount + 1,
              });

              retryTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current && !isCleaningUpRef.current) {
                  subscribe();
                }
              }, delay);
            } else {
              // Max retries reached - fall back to polling
              logError("❌ Max retries reached for realtime subscription");

              updateConnectionState({
                status: "error",
                error: enablePollingFallback
                  ? "Realtime unavailable. Using polling fallback."
                  : "Unable to connect to realtime updates.",
              });

              if (enablePollingFallback) {
                startPolling();
              }
            }
          } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
            log("⏱️ Connection attempt timed out");

            updateConnectionState({
              status: "error",
              error: "Connection timed out. Retrying...",
            });

            // Clean up
            if (channelRef.current) {
              try {
                supabase.removeChannel(channelRef.current);
              } catch (e) {
                logError("Error removing timed out channel", e);
              }
              channelRef.current = null;
            }

            // Retry on timeout
            if (retryCount < MAX_RETRIES) {
              const delay = getRetryDelay(retryCount);

              updateConnectionState({
                retryCount: retryCount + 1,
              });

              retryTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current && !isCleaningUpRef.current) {
                  subscribe();
                }
              }, delay);
            } else if (enablePollingFallback) {
              startPolling();
            }
          } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
            log("🔌 Channel closed");

            if (!isCleaningUpRef.current) {
              updateConnectionState({
                status: "disconnected",
              });
            }
          }
        });

      channelRef.current = channel;
    } catch (e) {
      logError("Exception during subscription setup", e);

      updateConnectionState({
        status: "error",
        error: "Failed to set up subscription",
      });

      if (enablePollingFallback) {
        startPolling();
      }
    }
  }, [
    userId,
    connectionState.retryCount,
    parseOrder,
    stopPolling,
    startPolling,
    enablePollingFallback,
    fetchInitialOrders,
    getRetryDelay,
    log,
    logError,
    updateConnectionState,
  ]);

  /**
   * Handle visibility change (tab visibility)
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!enabled || !userId) return;

      if (document.visibilityState === "visible") {
        log("🔄 Tab became visible, checking connection");

        // If we're not connected or using polling, try to reconnect
        if (connectionState.status !== "connected") {
          refresh();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, userId, connectionState.status, log]);

  /**
   * Main subscription effect
   */
  useEffect(() => {
    if (!enabled || !userId) {
      cleanup();
      return;
    }

    subscribe();

    return cleanup;
  }, [userId, enabled]); // Only depend on userId and enabled

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  /**
   * Manual refresh - useful for manual reconnection or after network issues
   */
  const refresh = useCallback(() => {
    log("🔄 Manual refresh triggered");

    cleanup();

    // Reset state
    connectionAttemptRef.current = 0;
    updateConnectionState({
      retryCount: 0,
      error: null,
    });

    // Re-subscribe
    if (enabled && userId && mountedRef.current) {
      setTimeout(() => {
        subscribe();
      }, 100);
    }
  }, [cleanup, subscribe, enabled, userId, log, updateConnectionState]);

  /**
   * Force switch to polling mode
   */
  const switchToPolling = useCallback(() => {
    log("🔄 Manually switching to polling mode");
    cleanup();
    if (enablePollingFallback) {
      startPolling();
    }
  }, [cleanup, startPolling, enablePollingFallback, log]);

  return {
    // Connection state
    isConnected: connectionState.status === "connected",
    status: connectionState.status,
    error: connectionState.error,
    isUsingPolling: connectionState.isUsingPolling,
    retryCount: connectionState.retryCount,
    lastSuccessfulConnection: connectionState.lastSuccessfulConnection,

    // Methods
    cleanup,
    refresh,
    switchToPolling,
  };
}
