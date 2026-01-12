"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string;
  date: string;
  time: string;
  duration: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: "ai" | "manual";
  service?: string;
  notes?: string;
  created_at: string;
}

interface UseRealtimeAppointmentsOptions {
  userId: string | null;
  onInsert?: (appointment: Appointment) => void;
  onUpdate?: (appointment: Appointment) => void;
  onDelete?: (oldAppointment: { id: string }) => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to real-time appointment changes.
 *
 * Uses Supabase Realtime to listen for INSERT, UPDATE, DELETE events
 * on the appointments table filtered by user_id.
 *
 * FIX: Uses refs for callbacks to prevent subscription recreation on every render.
 */
export function useRealtimeAppointments({
  userId,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeAppointmentsOptions) {
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
      console.log("🔌 Unsubscribing from appointments realtime channel");
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
      console.log("🔌 Appointments channel already exists, skipping...");
      return;
    }

    console.log("🔌 Setting up realtime subscription for appointments");
    console.log(`   User ID: ${userId}`);

    // Create a stable channel name (without timestamp to prevent recreation)
    const channelName = `appointments:${userId}`;

    // Subscribe to appointments table changes for this user
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📥 New appointment received:", payload.new);
          // Use ref to get latest callback
          if (onInsertRef.current && payload.new) {
            onInsertRef.current(payload.new as Appointment);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📝 Appointment updated:", payload.new);
          // Use ref to get latest callback
          if (onUpdateRef.current && payload.new) {
            onUpdateRef.current(payload.new as Appointment);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "appointments",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("🗑️ Appointment deleted:", payload.old);
          // Use ref to get latest callback
          if (onDeleteRef.current && payload.old) {
            onDeleteRef.current({ id: (payload.old as { id: string }).id });
          }
        }
      )
      .subscribe((status) => {
        console.log(`🔌 Appointments realtime subscription status: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("✅ Successfully subscribed to appointments updates");
          setIsConnected(true);
          setConnectionError(null);
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ Failed to subscribe to appointments");
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
