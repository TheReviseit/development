"use client";

/**
 * Real-Time Store Sync Utilities
 *
 * Production-grade real-time synchronization system for store updates.
 * Uses multiple strategies for maximum reliability:
 *
 * 1. Supabase Realtime - Cross-device real-time sync (PRIMARY)
 *    - Subscribes to products table changes
 *    - Subscribes to product_variants table changes
 * 2. BroadcastChannel API - Instant same-browser cross-tab sync
 * 3. localStorage events - Fallback for older browsers
 * 4. Polling - For when WebSocket connection is lost
 *
 * @author Flowauxi Team
 */

import {
  createClient,
  RealtimeChannel,
  SupabaseClient,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

// Channel name for broadcast
const STORE_SYNC_CHANNEL = "flowauxi-store-sync";
const STORE_UPDATE_KEY = "flowauxi-store-update-signal";

// Types
export interface StoreUpdateEvent {
  type:
    | "PRODUCT_UPDATED"
    | "PRODUCT_INSERTED"
    | "PRODUCT_DELETED"
    | "VARIANT_UPDATED"
    | "PRODUCTS_UPDATED"
    | "STORE_UPDATED";
  storeId: string;
  productId?: string;
  variantId?: string;
  timestamp: number;
  version: number;
  payload?: Record<string, unknown>;
}

// Connection status for debugging
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

// Singleton instances
let broadcastChannel: BroadcastChannel | null = null;
let realtimeSupabase: SupabaseClient | null = null;
let connectionStatus: ConnectionStatus = "disconnected";
let connectionStatusListeners: ((status: ConnectionStatus) => void)[] = [];

/**
 * Get or create the Supabase client for realtime subscriptions
 */
function getRealtimeSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  if (!realtimeSupabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[StoreSync] Missing Supabase credentials for realtime");
      return null;
    }

    realtimeSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return realtimeSupabase;
}

/**
 * Initialize the broadcast channel for real-time sync
 */
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;

  if (!broadcastChannel && typeof BroadcastChannel !== "undefined") {
    try {
      broadcastChannel = new BroadcastChannel(STORE_SYNC_CHANNEL);
    } catch (e) {
      console.warn("[StoreSync] BroadcastChannel not supported:", e);
      return null;
    }
  }

  return broadcastChannel;
}

/**
 * Update and broadcast connection status
 */
function setConnectionStatus(status: ConnectionStatus): void {
  connectionStatus = status;
  connectionStatusListeners.forEach((listener) => listener(status));
}

/**
 * Subscribe to connection status changes
 */
export function onConnectionStatusChange(
  listener: (status: ConnectionStatus) => void,
): () => void {
  connectionStatusListeners.push(listener);
  // Immediately call with current status
  listener(connectionStatus);
  return () => {
    connectionStatusListeners = connectionStatusListeners.filter(
      (l) => l !== listener,
    );
  };
}

/**
 * Get current connection status
 */
export function getConnectionStatus(): ConnectionStatus {
  return connectionStatus;
}

/**
 * Broadcast a store update event to all tabs/windows
 * Called from Dashboard when products are saved
 */
export function broadcastStoreUpdate(
  storeId: string,
  productId?: string,
): void {
  if (typeof window === "undefined") return;

  const event: StoreUpdateEvent = {
    type: "PRODUCTS_UPDATED",
    storeId,
    productId,
    timestamp: Date.now(),
    version: Date.now(),
  };

  // Strategy 1: BroadcastChannel (modern browsers, same origin)
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(event);
      console.log("[StoreSync] Broadcast sent via BroadcastChannel:", event);
    } catch (e) {
      console.warn("[StoreSync] BroadcastChannel postMessage failed:", e);
    }
  }

  // Strategy 2: localStorage event (fallback & cross-tab)
  try {
    localStorage.setItem(STORE_UPDATE_KEY, JSON.stringify(event));
    setTimeout(() => {
      localStorage.removeItem(STORE_UPDATE_KEY);
    }, 100);
    console.log("[StoreSync] Broadcast sent via localStorage");
  } catch (e) {
    console.warn("[StoreSync] localStorage broadcast failed:", e);
  }
}

/**
 * Subscribe to store update events from ALL sources
 * - Supabase Realtime (cross-device) - products & product_variants tables
 * - BroadcastChannel (same-browser tabs)
 * - localStorage (fallback)
 *
 * Returns cleanup function
 */
export function subscribeToStoreUpdates(
  storeId: string,
  onUpdate: (event: StoreUpdateEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const cleanupFunctions: (() => void)[] = [];

  // Debounce to prevent duplicate updates from multiple sources
  let lastUpdateTime = 0;
  const DEBOUNCE_MS = 500;

  const handleEvent = (event: StoreUpdateEvent) => {
    // Only process events for our store
    if (event.storeId !== storeId && event.storeId !== "*") return;

    // Debounce: ignore if we just processed an update
    const now = Date.now();
    if (now - lastUpdateTime < DEBOUNCE_MS) {
      console.log("[StoreSync] Debounced duplicate update");
      return;
    }
    lastUpdateTime = now;

    console.log(
      "[StoreSync] ✅ Update received:",
      event.type,
      event.productId || "",
    );
    onUpdate(event);
  };

  // ========================================
  // Strategy 1: Supabase Realtime (PRIMARY)
  // Cross-device, cross-browser real-time sync
  // Subscribes to PRODUCTS and PRODUCT_VARIANTS tables
  // ========================================
  const supabase = getRealtimeSupabase();
  let productsChannel: RealtimeChannel | null = null;

  if (supabase) {
    try {
      setConnectionStatus("connecting");

      // Create a single channel for both products and variants
      productsChannel = supabase
        .channel(`store-products:${storeId}`)
        // Subscribe to products table changes
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE
            schema: "public",
            table: "products",
            filter: `user_id=eq.${storeId}`,
          },
          (
            payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
          ) => {
            console.log(
              "[StoreSync] 📡 Products table change:",
              payload.eventType,
            );

            const eventType =
              payload.eventType === "INSERT"
                ? "PRODUCT_INSERTED"
                : payload.eventType === "DELETE"
                  ? "PRODUCT_DELETED"
                  : "PRODUCT_UPDATED";

            handleEvent({
              type: eventType,
              storeId,
              productId:
                ((payload.new as Record<string, unknown>)?.id as string) ||
                ((payload.old as Record<string, unknown>)?.id as string),
              timestamp: Date.now(),
              version: Date.now(),
              payload:
                (payload.new as Record<string, unknown>) ||
                (payload.old as Record<string, unknown>),
            });
          },
        )
        // Subscribe to product_variants table changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "product_variants",
            filter: `user_id=eq.${storeId}`,
          },
          (
            payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
          ) => {
            console.log(
              "[StoreSync] 📡 Variants table change:",
              payload.eventType,
            );

            handleEvent({
              type: "VARIANT_UPDATED",
              storeId,
              productId:
                ((payload.new as Record<string, unknown>)
                  ?.product_id as string) ||
                ((payload.old as Record<string, unknown>)
                  ?.product_id as string),
              variantId:
                ((payload.new as Record<string, unknown>)?.id as string) ||
                ((payload.old as Record<string, unknown>)?.id as string),
              timestamp: Date.now(),
              version: Date.now(),
              payload:
                (payload.new as Record<string, unknown>) ||
                (payload.old as Record<string, unknown>),
            });
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected");
            console.log(
              "[StoreSync] 🟢 Supabase Realtime connected for store:",
              storeId,
            );
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("error");
            console.warn(
              "[StoreSync] 🔴 Supabase Realtime error:",
              status,
              err,
            );
          } else if (status === "CLOSED") {
            setConnectionStatus("disconnected");
            console.log("[StoreSync] ⚪ Supabase Realtime closed");
          }
        });

      cleanupFunctions.push(() => {
        if (productsChannel) {
          supabase.removeChannel(productsChannel);
          setConnectionStatus("disconnected");
        }
      });
    } catch (e) {
      console.warn("[StoreSync] Supabase Realtime subscription failed:", e);
      setConnectionStatus("error");
    }
  }

  // ========================================
  // Strategy 2: BroadcastChannel listener
  // Same-browser, cross-tab sync (instant)
  // ========================================
  const channel = getBroadcastChannel();
  const handleBroadcast = (e: MessageEvent<StoreUpdateEvent>) => {
    handleEvent(e.data);
  };

  if (channel) {
    channel.addEventListener("message", handleBroadcast);
    cleanupFunctions.push(() => {
      channel.removeEventListener("message", handleBroadcast);
    });
  }

  // ========================================
  // Strategy 3: localStorage listener
  // Fallback for older browsers
  // ========================================
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORE_UPDATE_KEY && e.newValue) {
      try {
        const event: StoreUpdateEvent = JSON.parse(e.newValue);
        handleEvent(event);
      } catch (err) {
        console.warn("[StoreSync] Failed to parse storage event:", err);
      }
    }
  };

  window.addEventListener("storage", handleStorage);
  cleanupFunctions.push(() => {
    window.removeEventListener("storage", handleStorage);
  });

  // Return combined cleanup function
  return () => {
    cleanupFunctions.forEach((cleanup) => cleanup());
  };
}

/**
 * Check if Supabase Realtime is connected
 */
export function isRealtimeConnected(): boolean {
  return connectionStatus === "connected";
}

/**
 * Get the last known update version for a store
 */
export function getLastUpdateVersion(storeId: string): number {
  if (typeof window === "undefined") return 0;

  try {
    const stored = localStorage.getItem(`store-version-${storeId}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the last known update version for a store
 */
export function setLastUpdateVersion(storeId: string, version: number): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(`store-version-${storeId}`, version.toString());
  } catch {
    // Ignore storage errors
  }
}
