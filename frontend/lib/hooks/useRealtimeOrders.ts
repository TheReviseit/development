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

    console.log("🔌 Setting up realtime subscription for orders");
    console.log(`   User ID: ${userId}`);

    // Create a unique channel name
    const channelName = `orders:${userId}:${Date.now()}`;

    // Subscribe to orders table changes for this user
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📦 New order received:", payload.new);
          if (onInsert && payload.new) {
            onInsert(payload.new as Order);
          }
        }
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
          console.log("📦 Order updated:", payload.new);
          if (onUpdate && payload.new) {
            onUpdate(payload.new as Order);
          }
        }
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
          console.log("📦 Order deleted:", payload.old);
          if (onDelete && payload.old) {
            onDelete({ id: (payload.old as { id: string }).id });
          }
        }
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

    // Cleanup on unmount or when dependencies change
    return cleanup;
  }, [userId, enabled, onInsert, onUpdate, onDelete, cleanup]);

  return { isConnected, connectionError, cleanup };
}
