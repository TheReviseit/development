"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import type {
  AuthContextType,
  SupabaseUser,
  SyncUserResponse,
} from "@/types/auth.types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Component
 * Manages Firebase auth state and auto-syncs to Supabase
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  /**
   * Sync Firebase user to Supabase
   */
  const syncUser = useCallback(async (idToken: string) => {
    try {
      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to sync user");
      }

      const data: SyncUserResponse = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
        return data.user;
      } else {
        throw new Error(data.error || "Sync failed");
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      setError(err);
      throw err;
    }
  }, []);

  /**
   * Sign out handler
   */
  const handleSignOut = useCallback(async () => {
    try {
      await auth.signOut();
      setUser(null);
      setFirebaseUser(null);
    } catch (err: any) {
      console.error("Sign out error:", err);
      setError(err);
      throw err;
    }
  }, []);

  /**
   * Listen to Firebase auth state changes
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUserData) => {
      try {
        setFirebaseUser(firebaseUserData);

        if (firebaseUserData) {
          try {
            // Get ID token and sync to Supabase
            const idToken = await firebaseUserData.getIdToken();
            await syncUser(idToken);
            console.log("✅ User synced successfully to Supabase");
          } catch (err) {
            console.error("❌ Auto-sync failed:", err);
            setError(err);
            // Don't throw - allow user to stay logged in to Firebase even if Supabase sync fails
          }
        } else {
          // User signed out
          setUser(null);
        }
      } catch (err) {
        console.error("❌ Auth state change error:", err);
        setError(err);
      } finally {
        // Always set loading to false, even if there's an error
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [syncUser]);

  /**
   * Auto-refresh token every 50 minutes (tokens expire in 1 hour)
   */
  useEffect(() => {
    if (!firebaseUser) return;

    const refreshInterval = setInterval(async () => {
      try {
        const idToken = await firebaseUser.getIdToken(true); // Force refresh
        await syncUser(idToken);
        console.log("Token refreshed and user re-synced");
      } catch (err) {
        console.error("Token refresh failed:", err);
      }
    }, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(refreshInterval);
  }, [firebaseUser, syncUser]);

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    error,
    syncUser,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
