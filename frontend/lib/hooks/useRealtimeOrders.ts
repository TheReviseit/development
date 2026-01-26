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
}

/**
 * Hook to subscribe to real-time order changes.
 *
 * Uses Supabase Realtime to listen for INSERT, UPDATE, DELETE events
 * on the orders table filtered by user_id.
 *
 * FIX: Uses refs for callbacks to prevent subscription recreation on every render.
 */
export function useRealtimeOrders({
  userId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOrdersOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // =====================================================================
  // FIX: Store callbacks in refs to prevent subscription recreation
  // This ensures the subscription remains stable across renders
  // =====================================================================
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  // Update refs when callbacks change (without triggering re-subscription)
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      console.log("🔌 Unsubscribing from orders realtime channel");
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      cleanup();
      return;
    }

    // Prevent duplicate subscriptions
    if (channelRef.current) {
      console.log("🔌 Channel already exists, skipping...");
      return;
    }

    console.log("🔌 Setting up realtime subscription for orders");
    console.log(`   User ID: ${userId}`);

    // Create a unique channel name (without timestamp to prevent recreation)
    const channelName = `orders:${userId}`;

    // Subscribe to orders table changes for this user
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          // filter: `user_id=eq.${userId}`, // Removing filter to avoid potential RLS/Type mismatch issues, filtering client-side instead
        },
        (payload) => {
          console.log("📦 New order received:", payload.new);

          // Client-side filtering
          if (userId && (payload.new as any).user_id !== userId) {
            return;
          }

          // Use ref to get latest callback
          if (onInsertRef.current && payload.new) {
            const order = payload.new as any;
            // Parse items if it's a string (JSON)
            if (typeof order.items === "string") {
              try {
                order.items = JSON.parse(order.items);
              } catch (e) {
                console.error("Failed to parse items:", e);
              }
            }
            onInsertRef.current(order as Order);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          // filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📦 Order updated:", payload.new);

          // Client-side filtering
          if (userId && (payload.new as any).user_id !== userId) {
            return;
          }

          // Use ref to get latest callback
          if (onUpdateRef.current && payload.new) {
            const order = payload.new as any;
            // Parse items if it's a string (JSON)
            if (typeof order.items === "string") {
              try {
                order.items = JSON.parse(order.items);
              } catch (e) {
                console.error("Failed to parse items:", e);
              }
            }
            onUpdateRef.current(order as Order);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
          // filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📦 Order deleted:", payload.old);

          // Note: payload.old only contains the ID for DELETE events usually, unless REPLICA IDENTITY FULL is set
          // We can't easily filter by user_id here if it's not present.
          // However, we can trust the client handling to ignore IDs it doesn't know about.

          // Use ref to get latest callback
          if (onDeleteRef.current && payload.old) {
            onDeleteRef.current({ id: (payload.old as { id: string }).id });
          }
        },
      )
      .subscribe((status) => {
        console.log(`🔌 Orders realtime subscription status: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("✅ Successfully subscribed to orders updates");
          setIsConnected(true);
          setConnectionError(null);
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ Failed to subscribe to orders");
          setIsConnected(false);
          setConnectionError("Failed to connect to realtime updates");
        } else if (status === "TIMED_OUT") {
          setIsConnected(false);
          setConnectionError("Connection timed out");
        } else if (status === "CLOSED") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount or when userId/enabled change
    return cleanup;
  }, [userId, enabled, cleanup]); // FIX: Removed onInsert, onUpdate, onDelete from deps

  return { isConnected, connectionError, cleanup };
}
