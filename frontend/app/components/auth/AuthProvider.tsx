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
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import type {
  AuthContextType,
  AuthState,
  AuthErrorCode,
  SupabaseUser,
  SyncUserResponse,
  ProductDomain,
  ProductMembership,
} from "@/types/auth.types";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>(
    "INITIALIZING" as AuthState,
  );
  const [error, setError] = useState<any>(null);

  // NEW (Option B): Product membership state
  const [currentProduct, setCurrentProduct] = useState<ProductDomain | null>(
    null,
  );
  const [availableProducts, setAvailableProducts] = useState<ProductDomain[]>(
    [],
  );
  const [userMemberships, setUserMemberships] = useState<ProductMembership[]>(
    [],
  );

  // Timeout protection
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_AUTH_TIMEOUT = 10000; // 10 seconds

  // Re-entrance guard: prevents concurrent sync calls
  const syncInProgressRef = useRef(false);
  const firebaseUserRef = useRef<FirebaseUserType | null>(null);

  // Cross-tab coordination: prevent duplicate syncs from racing
  const authChannelRef = useRef<BroadcastChannel | null>(null);
  const lastSyncTimestampRef = useRef<number>(0);
  const SYNC_DEBOUNCE_MS = 3000; // Minimum 3s between syncs across tabs

  const detectCurrentProduct = useCallback((): ProductDomain => {
    return getProductDomainFromBrowser();
  }, []);

  /**
   * Structured logging for auth state transitions
   */
  const logAuthTransition = useCallback(
    (from: AuthState, to: AuthState, reason?: string, userId?: string) => {
      console.log(
        `[AUTH] ${from} → ${to}${reason ? ` (${reason})` : ""}${userId ? ` user=${userId.substring(0, 8)}` : ""}`,
      );
    },
    [],
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

  // ========================================================================
  // SESSION MANAGEMENT
  // ========================================================================

  /**
   * Force clear session (for SESSION_ONLY state)
   * CRITICAL: This is called when Firebase session exists but DB user doesn't
   */
  const clearSession = useCallback(async () => {
    console.warn(
      "[AUTH] Clearing full auth session (Firebase + cookies + storage)",
    );
    try {
      // Clear server-side session cookie
      try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) {
          console.error(
            "[AUTH] Failed to clear session cookie",
            response.status,
          );
        } else {
          console.info("[AUTH] Session cookie cleared");
        }
      } catch (apiErr) {
        console.error("[AUTH] Error calling /api/auth/logout:", apiErr);
      }

      // Clear browser storage
      try {
        if (typeof window !== "undefined") {
          const keysToClear = [
            "sidebar-hidden-items",
            "pending_onboarding",
            "ai-capabilities-cache",
          ];
          keysToClear.forEach((key) => {
            try {
              window.localStorage.removeItem(key);
              window.sessionStorage.removeItem(key);
            } catch {
              // Ignore per-key errors
            }
          });
        }
      } catch (storageErr) {
        console.error("[AUTH] Error clearing local storage:", storageErr);
      }

      // Sign out from Firebase last
      await auth.signOut();
      setUser(null);
      setFirebaseUser(null);
      setUserMemberships([]);
      setCurrentProduct(null);
      setAvailableProducts([]);
      updateAuthState("UNAUTHENTICATED" as AuthState, "SESSION_CLEARED");

      // Notify other tabs about signout
      try {
        authChannelRef.current?.postMessage({ type: "SIGNED_OUT" });
      } catch {
        // BroadcastChannel may be closed
      }
    } catch (err: any) {
      console.error("[AUTH] Error during clearSession:", err);
      setError(err);
      updateAuthState("AUTH_ERROR" as AuthState, "CLEAR_SESSION_FAILED");
    }
  }, [updateAuthState]);

  // ========================================================================
  // SYNC USER FUNCTIONS
  // ========================================================================

  /**
   * Sync Firebase user to Supabase (session restoration)
   * CRITICAL: Does NOT create new users. Returns 404 if user missing.
   * NEW (Option B): Checks product membership
   */
  const syncUser = useCallback(
    async (idToken: string): Promise<SupabaseUser> => {
      try {
        updateAuthState("SYNCING_TO_DB" as AuthState, "SYNC_INITIATED");

        const response = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
          let errorMessage = `Sync failed with status ${response.status}`;
          let errorCode: AuthErrorCode = "SYNC_FAILED" as AuthErrorCode;

          try {
            const errorData = await response.json();
            console.error("[AUTH] Sync error response:", errorData);
            errorMessage = errorData.error || errorData.message || errorMessage;
            errorCode = errorData.code || errorCode;

            // NEW (Option B): Handle PRODUCT_NOT_ENABLED
            if (errorCode === "PRODUCT_NOT_ENABLED") {
              console.warn(
                `[AUTH] Product not enabled: ${errorData.currentProduct}`,
              );
              setCurrentProduct(errorData.currentProduct);
              setAvailableProducts(errorData.availableProducts || []);
              updateAuthState(
                "PRODUCT_NOT_ENABLED" as AuthState,
                "MEMBERSHIP_MISSING",
              );
              throw new Error("PRODUCT_NOT_ENABLED");
            }

            // Handle USER_NOT_FOUND (orphaned Firebase account)
            if (errorCode === "USER_NOT_FOUND" || response.status === 404) {
              console.error(
                "[AUTH] USER_NOT_FOUND - Setting SESSION_ONLY state",
              );
              updateAuthState("SESSION_ONLY" as AuthState, "USER_NOT_IN_DB");
              throw new Error("USER_NOT_FOUND");
            }
          } catch (parseErr) {
            if (
              (parseErr as Error).message === "PRODUCT_NOT_ENABLED" ||
              (parseErr as Error).message === "USER_NOT_FOUND"
            ) {
              throw parseErr; // Re-throw handled errors
            }
            console.warn("[AUTH] Could not parse sync error response");
          }

          throw new Error(errorMessage);
        }

        const data: SyncUserResponse = await response.json();

        if (data.success && data.user) {
          setUser(data.user);
          updateAuthState("AUTHENTICATED" as AuthState, "SYNC_SUCCESS");
          return data.user;
        } else {
          throw new Error(data.error || "Sync failed");
        }
      } catch (err: any) {
        console.error("[AUTH] Sync error:", err.message || err);

        // Network error
        if (err.name === "TypeError" && err.message === "Failed to fetch") {
          console.error("[AUTH] Network error - could not reach auth API");
          updateAuthState("AUTH_ERROR" as AuthState, "NETWORK_ERROR");
        }
        // Product not enabled (don't set error state, show activation UI)
        else if (err.message === "PRODUCT_NOT_ENABLED") {
          console.warn("[AUTH] Product membership missing");
          // State already set to PRODUCT_NOT_ENABLED above
        }
        // User not found (don't log error, just maintain SESSION_ONLY state)
        else if (err.message === "USER_NOT_FOUND") {
          console.warn("[AUTH] User not found in database");
        }
        // Other errors
        else {
          console.error("[AUTH] Unexpected sync error:", err);
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
        updateAuthState("SYNCING_TO_DB" as AuthState, "SIGNUP_SYNC_INITIATED");

        const response = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, allowCreate: true }),
        });

        if (!response.ok) {
          let errorMessage = `Signup sync failed with status ${response.status}`;

          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;

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
          return data.user;
        } else {
          throw new Error(data.error || "Signup sync failed");
        }
      } catch (err: any) {
        console.error("[AUTH] Signup sync error:", err.message || err);
        updateAuthState("AUTH_ERROR" as AuthState, "SIGNUP_SYNC_EXCEPTION");
        setError(err);
        throw err;
      }
    },
    [updateAuthState],
  );

  // ========================================================================
  // PRODUCT ACTIVATION (OPTION B)
  // ========================================================================

  /**
   * Activate a new product for the current user
   * Returns true on success, false on failure
   */
  const activateProduct = useCallback(
    async (product: ProductDomain): Promise<boolean> => {
      try {
        console.log(`[AUTH] Activating product: ${product}`);

        const response = await fetch("/api/products/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          console.log(`[AUTH] Product activated successfully: ${product}`);

          // Re-sync to update auth state (will now pass membership check)
          if (firebaseUser) {
            try {
              const idToken = await firebaseUser.getIdToken();
              await syncUser(idToken);
              return true;
            } catch (syncErr) {
              console.error(
                "[AUTH] Failed to re-sync after activation:",
                syncErr,
              );
              return false;
            }
          }

          return true;
        }

        console.error(
          `[AUTH] Product activation failed: ${data.code} - ${data.error}`,
        );
        return false;
      } catch (error) {
        console.error("[AUTH] Product activation error:", error);
        return false;
      }
    },
    [firebaseUser, syncUser],
  );

  /**
   * Check if user has active membership for a product
   */
  const hasProductAccess = useCallback(
    (product: ProductDomain): boolean => {
      // Dashboard is always accessible (free tier)
      if (product === "dashboard") return true;

      // Check userMemberships array
      const membership = userMemberships.find((m) => m.product === product);
      return membership
        ? ["trial", "active"].includes(membership.status)
        : false;
    },
    [userMemberships],
  );

  /**
   * Get membership details for a specific product
   */
  const getProductMembership = useCallback(
    (product: ProductDomain): ProductMembership | null => {
      return userMemberships.find((m) => m.product === product) || null;
    },
    [userMemberships],
  );

  // ========================================================================
  // SIGN OUT
  // ========================================================================

  const handleSignOut = useCallback(async () => {
    try {
      await clearSession();
    } catch (err: any) {
      console.error("[AUTH] Sign out error:", err);
      setError(err);
      throw err;
    }
  }, [clearSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window))
      return;

    const channel = new BroadcastChannel("flowauxi_auth");
    authChannelRef.current = channel;

    channel.onmessage = (event) => {
      const { type, timestamp } = event.data;
      if (type === "SYNC_COMPLETE") {
        // Another tab just completed sync — update our timestamp so we
        // skip our own redundant sync if it hasn't started yet.
        lastSyncTimestampRef.current = Math.max(
          lastSyncTimestampRef.current,
          timestamp,
        );
        console.log(
          "[AUTH] Cross-tab: another tab completed sync, skipping redundant sync",
        );
      } else if (type === "SIGNED_OUT") {
        // Another tab signed out — mirror locally without calling
        // auth.signOut() again (it already happened globally via Firebase).
        console.log("[AUTH] Cross-tab: sign-out detected from another tab");
        setUser(null);
        setUserMemberships([]);
        setCurrentProduct(null);
        setAvailableProducts([]);
        updateAuthState("UNAUTHENTICATED" as AuthState, "CROSS_TAB_SIGNOUT");
      }
    };

    return () => {
      channel.close();
      authChannelRef.current = null;
    };
  }, [updateAuthState]);

  // ========================================================================
  // FIREBASE AUTH STATE LISTENER
  // ========================================================================

  /**
   * Listen to Firebase auth state changes
   * CRITICAL: Sync failure triggers immediate signout
   *
   * DUPLICATE-TAB FIX: When a tab is duplicated, onAuthStateChanged fires
   * in the new tab. Before, this would race with the original tab's session
   * cookie, causing createSessionCookie to invalidate the first tab's token.
   * Now we:
   * 1. Debounce syncs across tabs via BroadcastChannel
   * 2. Retry once before calling clearSession (which does auth.signOut globally)
   * 3. On USER_NOT_FOUND, only sign out the current tab's state, not Firebase
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUserData) => {
      // Clear any existing timeout
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }

      // Update ref for stable access
      firebaseUserRef.current = firebaseUserData;

      // Set timeout protection
      authTimeoutRef.current = setTimeout(() => {
        setAuthState((currentState) => {
          if (
            currentState !== ("AUTHENTICATED" as AuthState) &&
            currentState !== ("UNAUTHENTICATED" as AuthState) &&
            currentState !== ("PRODUCT_NOT_ENABLED" as AuthState)
          ) {
            console.error("[AUTH] Auth timeout — forcing signout");
            auth.signOut();
            return "AUTH_ERROR" as AuthState;
          }
          return currentState;
        });
      }, MAX_AUTH_TIMEOUT);

      try {
        setFirebaseUser(firebaseUserData);

        if (firebaseUserData) {
          // Re-entrance guard (same tab)
          if (syncInProgressRef.current) {
            return;
          }

          // Cross-tab debounce: if another tab just synced within the
          // debounce window, skip sync and trust the shared session cookie.
          const now = Date.now();
          if (now - lastSyncTimestampRef.current < SYNC_DEBOUNCE_MS) {
            console.log("[AUTH] Skipping sync — another tab synced recently");
            // Still need to hydrate local state: fetch the token without
            // force-refresh and call sync (the server will just return the
            // existing session without overwriting the cookie).
            // But first, try to use cached user state if we already have it.
            // If we have no local user state, we do need to sync.
            if (user) {
              // Already have user state (e.g., from a previous render or
              // cross-tab message). Just ensure we're in AUTHENTICATED.
              updateAuthState(
                "AUTHENTICATED" as AuthState,
                "CROSS_TAB_CACHE_HIT",
              );
              return;
            }
            // No cached user — fall through to sync but after a small delay
            // to let the other tab's cookie settle.
            await new Promise((r) => setTimeout(r, 500));
          }

          syncInProgressRef.current = true;

          updateAuthState(
            "VERIFYING_SESSION" as AuthState,
            "FIREBASE_USER_FOUND",
          );

          // Detect current product
          const product = detectCurrentProduct();
          setCurrentProduct(product);

          try {
            const idToken = await firebaseUserData.getIdToken();
            await syncUser(idToken);

            // Notify other tabs that sync completed successfully
            lastSyncTimestampRef.current = Date.now();
            try {
              authChannelRef.current?.postMessage({
                type: "SYNC_COMPLETE",
                timestamp: lastSyncTimestampRef.current,
              });
            } catch {
              // BroadcastChannel may be closed
            }
          } catch (err: any) {
            console.error("[AUTH] Auto-sync failed:", err);

            // CRITICAL: Only clear session if it's NOT a product membership issue
            if (err.message !== "PRODUCT_NOT_ENABLED") {
              // RETRY ONCE before signing out globally — a transient failure
              // (e.g., race with another tab's createSessionCookie) should not
              // nuke the entire session across all tabs.
              console.warn(
                "[AUTH] Sync failure detected — retrying once before signout",
              );
              try {
                // Small delay to let any racing tab finish
                await new Promise((r) => setTimeout(r, 1000));
                const retryToken = await firebaseUserData.getIdToken(true);
                await syncUser(retryToken);
                console.log("[AUTH] Retry sync succeeded");

                lastSyncTimestampRef.current = Date.now();
                try {
                  authChannelRef.current?.postMessage({
                    type: "SYNC_COMPLETE",
                    timestamp: lastSyncTimestampRef.current,
                  });
                } catch {
                  // BroadcastChannel may be closed
                }
              } catch (retryErr: any) {
                console.error("[AUTH] Retry sync also failed:", retryErr);
                if (retryErr.message !== "PRODUCT_NOT_ENABLED") {
                  try {
                    await clearSession();
                    updateAuthState(
                      "UNAUTHENTICATED" as AuthState,
                      "SYNC_FAILED_SESSION_CLEARED",
                    );
                    // Notify other tabs
                    try {
                      authChannelRef.current?.postMessage({
                        type: "SIGNED_OUT",
                      });
                    } catch {
                      // BroadcastChannel may be closed
                    }
                  } catch (signOutErr) {
                    console.error(
                      "[AUTH] Error during forced signout:",
                      signOutErr,
                    );
                    updateAuthState(
                      "AUTH_ERROR" as AuthState,
                      "SIGNOUT_FAILED",
                    );
                  }
                }
              }
            }
            // If PRODUCT_NOT_ENABLED, state already set by syncUser, don't clear session
          } finally {
            syncInProgressRef.current = false;
          }
        } else {
          // User signed out
          setUser(null);
          setUserMemberships([]);
          setCurrentProduct(null);
          setAvailableProducts([]);
          syncInProgressRef.current = false;
          updateAuthState("UNAUTHENTICATED" as AuthState, "NO_FIREBASE_USER");
        }
      } catch (err) {
        console.error("[AUTH] Auth state change error:", err);
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
  }, [syncUser, updateAuthState, clearSession, detectCurrentProduct, user]);

  // ========================================================================
  // AUTO TOKEN REFRESH
  // ========================================================================

  /**
   * Auto-refresh token every 50 minutes (tokens expire in 1 hour)
   */
  useEffect(() => {
    if (!firebaseUser) return;

    const refreshInterval = setInterval(
      async () => {
        try {
          const idToken = await firebaseUser.getIdToken(true); // Force refresh
          await syncUser(idToken);
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

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  // Legacy loading flag for backward compatibility
  const loading = [
    "INITIALIZING" as AuthState,
    "VERIFYING_SESSION" as AuthState,
    "SYNCING_TO_DB" as AuthState,
  ].includes(authState);

  const value: AuthContextType = {
    // Core state
    user,
    firebaseUser,
    authState,
    loading,
    error,

    // Product membership (Option B)
    currentProduct,
    availableProducts,
    userMemberships,

    // Auth methods
    syncUser,
    syncUserForSignup,
    signOut: handleSignOut,
    clearSession,

    // Product methods (Option B)
    activateProduct,
    hasProductAccess,
    getProductMembership,
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
