"use client";

/**
 * Real-Time Booking Sync Utilities
 *
 * Production-grade real-time synchronization system for booking/service updates.
 * Adapted from storeSync.ts with booking-specific guards.
 *
 * Uses multiple strategies for maximum reliability:
 * 1. Supabase Realtime - Cross-device real-time sync (PRIMARY)
 * 2. BroadcastChannel API - Instant same-browser cross-tab sync
 * 3. localStorage events - Fallback for older browsers
 *
 * CRITICAL: Realtime updates are guarded by booking phase.
 * Updates are ignored when user is:
 * - Selecting time slot
 * - Filling booking form
 * - Processing payment
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
const BOOKING_SYNC_CHANNEL = "flowauxi-booking-sync";
const BOOKING_UPDATE_KEY = "flowauxi-booking-update-signal";

// ============================================================
// Types
// ============================================================
export type BookingPhase =
  | "BROWSING" // User is browsing services - ALLOW updates
  | "SELECTING_SLOT" // User is selecting time slot - BLOCK updates
  | "FILLING_FORM" // User is filling booking form - BLOCK updates
  | "PROCESSING_PAYMENT"; // Payment in progress - BLOCK updates

export interface ServiceUpdateEvent {
  type:
    | "SERVICE_UPDATED"
    | "SERVICE_INSERTED"
    | "SERVICE_DELETED"
    | "SERVICES_UPDATED";
  bookingId: string;
  serviceId?: string;
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

// ============================================================
// Singleton Instances
// ============================================================
let broadcastChannel: BroadcastChannel | null = null;
let realtimeSupabase: SupabaseClient | null = null;
let connectionStatus: ConnectionStatus = "disconnected";
let connectionStatusListeners: ((status: ConnectionStatus) => void)[] = [];

// Current booking phase - used to guard updates
let currentBookingPhase: BookingPhase = "BROWSING";
let bookingPhaseListeners: ((phase: BookingPhase) => void)[] = [];

// ============================================================
// Booking Phase Management
// ============================================================

/**
 * Set the current booking phase
 * When not in BROWSING phase, realtime updates are ignored
 */
export function setBookingPhase(phase: BookingPhase): void {
  currentBookingPhase = phase;
  bookingPhaseListeners.forEach((listener) => listener(phase));
  console.log(`[BookingSync] Phase changed to: ${phase}`);
}

/**
 * Get current booking phase
 */
export function getBookingPhase(): BookingPhase {
  return currentBookingPhase;
}

/**
 * Subscribe to booking phase changes
 */
export function onBookingPhaseChange(
  listener: (phase: BookingPhase) => void,
): () => void {
  bookingPhaseListeners.push(listener);
  listener(currentBookingPhase);
  return () => {
    bookingPhaseListeners = bookingPhaseListeners.filter((l) => l !== listener);
  };
}

/**
 * Check if realtime updates should be processed
 * Only allow during BROWSING phase
 */
export function shouldProcessRealtimeUpdates(): boolean {
  return currentBookingPhase === "BROWSING";
}

// ============================================================
// Supabase & Broadcast Helpers
// ============================================================

/**
 * Get or create the Supabase client for realtime subscriptions
 */
function getRealtimeSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;

  if (!realtimeSupabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[BookingSync] Missing Supabase credentials for realtime");
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
      broadcastChannel = new BroadcastChannel(BOOKING_SYNC_CHANNEL);
    } catch (e) {
      console.warn("[BookingSync] BroadcastChannel not supported:", e);
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

// ============================================================
// Broadcast Functions
// ============================================================

/**
 * Broadcast a service update event to all tabs/windows
 * Called from Dashboard when services are saved
 */
export function broadcastServiceUpdate(
  bookingId: string,
  serviceId?: string,
): void {
  if (typeof window === "undefined") return;

  const event: ServiceUpdateEvent = {
    type: "SERVICES_UPDATED",
    bookingId,
    serviceId,
    timestamp: Date.now(),
    version: Date.now(),
  };

  // Strategy 1: BroadcastChannel (modern browsers, same origin)
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(event);
      console.log("[BookingSync] Broadcast sent via BroadcastChannel:", event);
    } catch (e) {
      console.warn("[BookingSync] BroadcastChannel postMessage failed:", e);
    }
  }

  // Strategy 2: localStorage event (fallback & cross-tab)
  try {
    localStorage.setItem(BOOKING_UPDATE_KEY, JSON.stringify(event));
    setTimeout(() => {
      localStorage.removeItem(BOOKING_UPDATE_KEY);
    }, 100);
    console.log("[BookingSync] Broadcast sent via localStorage");
  } catch (e) {
    console.warn("[BookingSync] localStorage broadcast failed:", e);
  }
}

// ============================================================
// Subscription Functions
// ============================================================

/**
 * Subscribe to service update events from ALL sources
 * - Supabase Realtime (cross-device) - services table
 * - BroadcastChannel (same-browser tabs)
 * - localStorage (fallback)
 *
 * CRITICAL: Updates are GUARDED by booking phase.
 * When not in BROWSING phase, updates are ignored.
 *
 * Returns cleanup function
 */
export function subscribeToServiceUpdates(
  bookingId: string,
  onUpdate: (event: ServiceUpdateEvent) => void,
  onServiceDisabled?: (serviceId: string, serviceName: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const cleanupFunctions: (() => void)[] = [];

  // Debounce to prevent duplicate updates from multiple sources
  let lastUpdateTime = 0;
  const DEBOUNCE_MS = 500;

  const handleEvent = (event: ServiceUpdateEvent) => {
    // Only process events for our booking page
    if (event.bookingId !== bookingId && event.bookingId !== "*") return;

    // CRITICAL GUARD: Only process updates during BROWSING phase
    if (!shouldProcessRealtimeUpdates()) {
      console.log(
        `[BookingSync] ⚠️ Update ignored - currently in ${currentBookingPhase} phase`,
      );

      // If a service was deleted/disabled and we're mid-flow, notify via callback
      if (
        event.type === "SERVICE_DELETED" &&
        event.serviceId &&
        onServiceDisabled
      ) {
        onServiceDisabled(
          event.serviceId,
          (event.payload?.name as string) || "Service",
        );
      }
      return;
    }

    // Debounce: ignore if we just processed an update
    const now = Date.now();
    if (now - lastUpdateTime < DEBOUNCE_MS) {
      console.log("[BookingSync] Debounced duplicate update");
      return;
    }
    lastUpdateTime = now;

    console.log(
      "[BookingSync] ✅ Update received:",
      event.type,
      event.serviceId || "",
    );
    onUpdate(event);
  };

  // ========================================
  // Strategy 1: Supabase Realtime (PRIMARY)
  // Cross-device, cross-browser real-time sync
  // Subscribes to SERVICES table
  // ========================================
  const supabase = getRealtimeSupabase();
  let servicesChannel: RealtimeChannel | null = null;

  if (supabase) {
    try {
      setConnectionStatus("connecting");

      servicesChannel = supabase
        .channel(`booking-services:${bookingId}`)
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE
            schema: "public",
            table: "services",
            filter: `user_id=eq.${bookingId}`,
          },
          (
            payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
          ) => {
            console.log(
              "[BookingSync] 📡 Services table change:",
              payload.eventType,
            );

            const eventType =
              payload.eventType === "INSERT"
                ? "SERVICE_INSERTED"
                : payload.eventType === "DELETE"
                  ? "SERVICE_DELETED"
                  : "SERVICE_UPDATED";

            handleEvent({
              type: eventType,
              bookingId,
              serviceId:
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
              "[BookingSync] 🟢 Supabase Realtime connected for booking:",
              bookingId,
            );
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnectionStatus("error");
            console.warn(
              "[BookingSync] 🔴 Supabase Realtime error:",
              status,
              err,
            );
          } else if (status === "CLOSED") {
            setConnectionStatus("disconnected");
            console.log("[BookingSync] ⚪ Supabase Realtime closed");
          }
        });

      cleanupFunctions.push(() => {
        if (servicesChannel) {
          supabase.removeChannel(servicesChannel);
          setConnectionStatus("disconnected");
        }
      });
    } catch (e) {
      console.warn("[BookingSync] Supabase Realtime subscription failed:", e);
      setConnectionStatus("error");
    }
  }

  // ========================================
  // Strategy 2: BroadcastChannel listener
  // Same-browser, cross-tab sync (instant)
  // ========================================
  const channel = getBroadcastChannel();
  const handleBroadcast = (e: MessageEvent<ServiceUpdateEvent>) => {
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
    if (e.key === BOOKING_UPDATE_KEY && e.newValue) {
      try {
        const event: ServiceUpdateEvent = JSON.parse(e.newValue);
        handleEvent(event);
      } catch (err) {
        console.warn("[BookingSync] Failed to parse storage event:", err);
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

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if Supabase Realtime is connected
 */
export function isRealtimeConnected(): boolean {
  return connectionStatus === "connected";
}

/**
 * Get the last known update version for a booking page
 */
export function getLastUpdateVersion(bookingId: string): number {
  if (typeof window === "undefined") return 0;

  try {
    const stored = localStorage.getItem(`booking-version-${bookingId}`);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the last known update version for a booking page
 */
export function setLastUpdateVersion(bookingId: string, version: number): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(`booking-version-${bookingId}`, version.toString());
  } catch {
    // Ignore storage errors
  }
}
