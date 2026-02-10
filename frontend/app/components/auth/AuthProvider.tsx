"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { User as FirebaseUserType } from "firebase/auth";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import type {
  AuthContextType,
  AuthState,
  SupabaseUser,
  SyncUserResponse,
} from "@/types/auth.types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auth Provider Component
 * Manages Firebase auth state and auto-syncs to Supabase
 *
 * CRITICAL RULES:
 * 1. Sync failure = immediate Firebase signout (NO EXCEPTIONS)
 * 2. SESSION_ONLY state MUST trigger signout
 * 3. All state transitions are logged for observability
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>(
    "INITIALIZING" as AuthState,
  );
  const [error, setError] = useState<any>(null);

  // Timeout protection
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_AUTH_TIMEOUT = 10000; // 10 seconds

  // Re-entrance guard: prevents concurrent sync calls from re-subscriptions
  const syncInProgressRef = useRef(false);
  // Stable ref for firebaseUser to avoid stale closures in logging
  const firebaseUserRef = useRef<FirebaseUserType | null>(null);

  /**
   * Structured logging for auth state transitions
   */
  const logAuthTransition = useCallback(
    (from: AuthState, to: AuthState, reason?: string, userId?: string) => {
      console.info("[AUTH]", {
        from,
        to,
        reason,
        timestamp: Date.now(),
        userId: userId || firebaseUserRef.current?.uid || "unknown",
      });
    },
    [], // No deps — uses ref for stable access
  );

  /**
   * Update auth state with logging
   */
  const updateAuthState = useCallback(
    (newState: AuthState, reason?: string) => {
      setAuthState((prevState) => {
        if (prevState !== newState) {
          logAuthTransition(prevState, newState, reason);
        }
        return newState;
      });
    },
    [logAuthTransition],
  );

  /**
   * Force clear session (for SESSION_ONLY state)
   * CRITICAL: This is called when Firebase session exists but DB user doesn't
   */
  const clearSession = useCallback(async () => {
    try {
      console.warn(
        "[AUTH] Clearing stale session - user not found in database",
      );
      await auth.signOut();
      setUser(null);
      setFirebaseUser(null);
      updateAuthState("UNAUTHENTICATED" as AuthState, "SESSION_CLEARED");
    } catch (err: any) {
      console.error("[AUTH] Error clearing session:", err);
      setError(err);
    }
  }, [updateAuthState]);

  /**
   * Sync Firebase user to Supabase (session restoration)
   * CRITICAL: Does NOT create new users. Returns 404 if user missing.
   */
  const syncUser = useCallback(
    async (idToken: string): Promise<SupabaseUser> => {
      try {
        console.info("[AUTH] Starting DB sync (session restoration)...");
        console.info(
          "[AUTH] allowCreate will NOT be passed (defaults to false)",
        );
        updateAuthState("SYNCING_TO_DB" as AuthState, "SYNC_INITIATED");

        const response = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          // CRITICAL: allowCreate NOT passed, defaults to false (fail closed)
          body: JSON.stringify({ idToken }),
        });

        console.info("[AUTH] Sync response status:", response.status);

        if (!response.ok) {
          // Try to get the actual error message from the response
          let errorMessage = `Sync failed with status ${response.status}`;
          let errorCode = "SYNC_FAILED";

          try {
            const errorData = await response.json();
            console.error("[AUTH] Sync error response:", errorData);
            errorMessage = errorData.error || errorData.message || errorMessage;
            errorCode = errorData.code || errorCode;

            if (errorData.details) {
              console.error("[AUTH] Sync error details:", errorData.details);
            }
          } catch (parseErr) {
            // Response wasn't JSON — use the default error message
            console.warn("[AUTH] Could not parse sync error response");
          }

          // CHECK AFTER PARSING — must be outside the try/catch above
          // so the throw propagates correctly to the outer catch
          if (errorCode === "USER_NOT_FOUND" || response.status === 404) {
            console.error(
              "[AUTH] ❌❌❌ USER_NOT_FOUND - Setting SESSION_ONLY state",
            );
            updateAuthState("SESSION_ONLY" as AuthState, "USER_NOT_IN_DB");
            throw new Error("USER_NOT_FOUND");
          }

          throw new Error(errorMessage);
        }

        const data: SyncUserResponse = await response.json();

        if (data.success && data.user) {
          setUser(data.user);
          updateAuthState("AUTHENTICATED" as AuthState, "SYNC_SUCCESS");
          console.log("[AUTH] ✅ User synced successfully to Supabase");
          return data.user;
        } else {
          throw new Error(data.error || "Sync failed");
        }
      } catch (err: any) {
        console.error("[AUTH] ❌ Sync error caught:", err.message || err);
        // Check if it's a network error (backend not reachable)
        if (err.name === "TypeError" && err.message === "Failed to fetch") {
          console.error(
            "[AUTH] ❌ Sync error: Could not reach the auth API. Check if the server is running.",
          );
          updateAuthState("AUTH_ERROR" as AuthState, "NETWORK_ERROR");
        } else if (err.message === "USER_NOT_FOUND") {
          console.error(
            "[AUTH] ❌ User not found in database - SESSION_ONLY state set",
          );
          // SESSION_ONLY state already set above
        } else {
          console.error("[AUTH] ❌ Sync error:", err.message || err);
          updateAuthState("AUTH_ERROR" as AuthState, "SYNC_EXCEPTION");
        }

        setError(err);
        throw err;
      }
    },
    [updateAuthState],
  );

  /**
   * Sync Firebase user to Supabase (NEW USER SIGNUP ONLY)
   * CRITICAL: Allows creating new users. Only use during signup flow.
   */
  const syncUserForSignup = useCallback(
    async (idToken: string): Promise<SupabaseUser> => {
      try {
        console.info("[AUTH] Starting DB sync (new user signup)...");
        updateAuthState("SYNCING_TO_DB" as AuthState, "SIGNUP_SYNC_INITIATED");

        const response = await fetch("/api/auth/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          // CRITICAL: allowCreate explicitly set to true for signup
          body: JSON.stringify({ idToken, allowCreate: true }),
        });

        if (!response.ok) {
          let errorMessage = `Signup sync failed with status ${response.status}`;
          let errorCode = "SIGNUP_SYNC_FAILED";

          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
            errorCode = errorData.code || errorCode;

            if (errorData.details) {
              console.error(
                "[AUTH] Signup sync error details:",
                errorData.details,
              );
            }
          } catch (parseErr) {
            console.warn("[AUTH] Could not parse signup sync error response");
          }

          throw new Error(errorMessage);
        }

        const data: SyncUserResponse = await response.json();

        if (data.success && data.user) {
          setUser(data.user);
          updateAuthState("AUTHENTICATED" as AuthState, "SIGNUP_SYNC_SUCCESS");
          console.log("[AUTH] ✅ New user created and synced to Supabase");
          return data.user;
        } else {
          throw new Error(data.error || "Signup sync failed");
        }
      } catch (err: any) {
        console.error("[AUTH] ❌ Signup sync error:", err.message || err);
        updateAuthState("AUTH_ERROR" as AuthState, "SIGNUP_SYNC_EXCEPTION");
        setError(err);
        throw err;
      }
    },
    [updateAuthState],
  );

  /**
   * Sign out handler
   */
  const handleSignOut = useCallback(async () => {
    try {
      console.info("[AUTH] User initiated signout");
      await auth.signOut();
      setUser(null);
      setFirebaseUser(null);
      updateAuthState("UNAUTHENTICATED" as AuthState, "USER_SIGNOUT");
    } catch (err: any) {
      console.error("[AUTH] Sign out error:", err);
      setError(err);
      throw err;
    }
  }, [updateAuthState]);

  /**
   * Listen to Firebase auth state changes
   * CRITICAL: Sync failure triggers immediate signout
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUserData) => {
      // Clear any existing timeout
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }

      // Update ref for stable access in logging
      firebaseUserRef.current = firebaseUserData;

      // Set timeout protection — uses ref to read current state without dep
      authTimeoutRef.current = setTimeout(() => {
        // Read state directly from the setter to avoid stale closure
        setAuthState((currentState) => {
          if (
            currentState !== ("AUTHENTICATED" as AuthState) &&
            currentState !== ("UNAUTHENTICATED" as AuthState)
          ) {
            console.error("[AUTH] ❌ Auth timeout — forcing signout");
            auth.signOut();
            return "AUTH_ERROR" as AuthState;
          }
          return currentState;
        });
      }, MAX_AUTH_TIMEOUT);

      try {
        setFirebaseUser(firebaseUserData);

        if (firebaseUserData) {
          // Re-entrance guard: skip if sync already in progress
          if (syncInProgressRef.current) {
            console.info(
              "[AUTH] Sync already in progress, skipping duplicate onAuthStateChanged fire",
            );
            return;
          }
          syncInProgressRef.current = true;

          console.info("[AUTH] Firebase user detected, verifying...");
          updateAuthState(
            "VERIFYING_SESSION" as AuthState,
            "FIREBASE_USER_FOUND",
          );

          try {
            // Get ID token and sync to Supabase
            const idToken = await firebaseUserData.getIdToken();
            await syncUser(idToken);
            // State updated to AUTHENTICATED inside syncUser on success
          } catch (err: any) {
            console.error("[AUTH] ❌ Auto-sync failed:", err);

            // CRITICAL: Sync failure = signout
            console.warn("[AUTH] Signing out due to sync failure");
            try {
              await auth.signOut();
              setUser(null);
              setFirebaseUser(null);
              updateAuthState(
                "UNAUTHENTICATED" as AuthState,
                "SYNC_FAILED_SIGNOUT",
              );
            } catch (signOutErr) {
              console.error("[AUTH] Error during forced signout:", signOutErr);
              updateAuthState("AUTH_ERROR" as AuthState, "SIGNOUT_FAILED");
            }
          } finally {
            syncInProgressRef.current = false;
          }
        } else {
          // User signed out
          console.info("[AUTH] No Firebase user, setting unauthenticated");
          setUser(null);
          syncInProgressRef.current = false;
          updateAuthState("UNAUTHENTICATED" as AuthState, "NO_FIREBASE_USER");
        }
      } catch (err) {
        console.error("[AUTH] ❌ Auth state change error:", err);
        setError(err);
        syncInProgressRef.current = false;
        updateAuthState("AUTH_ERROR" as AuthState, "STATE_CHANGE_ERROR");
      } finally {
        if (authTimeoutRef.current) {
          clearTimeout(authTimeoutRef.current);
        }
      }
    });

    return () => {
      unsubscribe();
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
    };
    // CRITICAL: Do NOT include authState here.
    // Including it causes re-subscription on every state change → infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncUser, updateAuthState]);

  /**
   * Auto-refresh token every 50 minutes (tokens expire in 1 hour)
   */
  useEffect(() => {
    if (!firebaseUser) return;

    const refreshInterval = setInterval(
      async () => {
        try {
          console.info("[AUTH] Refreshing token...");
          const idToken = await firebaseUser.getIdToken(true); // Force refresh
          await syncUser(idToken);
          console.log("[AUTH] Token refreshed and user re-synced");
        } catch (err) {
          console.error("[AUTH] Token refresh failed:", err);
          // Token refresh failure = signout
          console.warn("[AUTH] Signing out due to token refresh failure");
          await auth.signOut();
        }
      },
      50 * 60 * 1000,
    ); // 50 minutes

    return () => clearInterval(refreshInterval);
  }, [firebaseUser, syncUser]);

  // NOTE: SESSION_ONLY auto-signout is handled inline in the onAuthStateChanged
  // callback (sync failure handler) and as a failsafe in DashboardAuthGuard.
  // A separate useEffect here was removed because it raced with the sync
  // failure handler, causing double-signout cascades.

  // Legacy loading flag for backward compatibility
  const loading = [
    "INITIALIZING" as AuthState,
    "VERIFYING_SESSION" as AuthState,
    "SYNCING_TO_DB" as AuthState,
  ].includes(authState);

  const value: AuthContextType = {
    user,
    firebaseUser,
    authState,
    loading, // Derived from authState
    error,
    syncUser,
    syncUserForSignup,
    signOut: handleSignOut,
    clearSession,
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
