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
import { detectProductFromRequest } from "@/lib/auth-helpers";
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

/**
 * Enterprise Auth Provider Component (Option B)
 * Standard: Google Workspace / Zoho One Architecture
 *
 * CRITICAL RULES:
 * 1. Sync failure = immediate Firebase signout (NO EXCEPTIONS)
 * 2. SESSION_ONLY state MUST trigger signout
 * 3. PRODUCT_NOT_ENABLED state triggers activation flow (NEW)
 * 4. All state transitions are logged for observability
 * 5. Product membership is server-enforced, never frontend-only
 */
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

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  /**
   * Detect current product domain (client-side)
   * In production, this should match server-side detection
   */
  const detectCurrentProduct = useCallback((): ProductDomain => {
    if (typeof window === "undefined") return "dashboard";

    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;

    // Production subdomain detection
    if (process.env.NODE_ENV === "production") {
      if (hostname.startsWith("shop.")) return "shop";
      if (hostname.startsWith("pages.")) return "showcase";
      if (hostname.startsWith("marketing.")) return "marketing";
      if (hostname.startsWith("api.")) return "api";
    }

    // Development port-based detection
    if (process.env.NODE_ENV === "development") {
      if (port === "3001") return "shop";
      if (port === "3002") return "showcase";
      if (port === "3003") return "marketing";
      if (port === "3004") return "api";

      // Pathname-based fallback
      if (
        pathname.startsWith("/dashboard/products") ||
        pathname.startsWith("/dashboard/orders")
      ) {
        return "shop";
      }
      if (
        pathname.startsWith("/dashboard/showcase") ||
        pathname.startsWith("/dashboard/pages")
      ) {
        return "showcase";
      }
      if (
        pathname.startsWith("/dashboard/campaigns") ||
        pathname.startsWith("/dashboard/marketing")
      ) {
        return "marketing";
      }
    }

    return "dashboard";
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

  // ========================================================================
  // FIREBASE AUTH STATE LISTENER
  // ========================================================================

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
          // Re-entrance guard
          if (syncInProgressRef.current) {
            return;
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
            // State updated to AUTHENTICATED inside syncUser on success
          } catch (err: any) {
            console.error("[AUTH] Auto-sync failed:", err);

            // CRITICAL: Only clear session if it's NOT a product membership issue
            if (err.message !== "PRODUCT_NOT_ENABLED") {
              console.warn("[AUTH] Sync failure detected — clearing session");
              try {
                await clearSession();
                updateAuthState(
                  "UNAUTHENTICATED" as AuthState,
                  "SYNC_FAILED_SESSION_CLEARED",
                );
              } catch (signOutErr) {
                console.error(
                  "[AUTH] Error during forced signout:",
                  signOutErr,
                );
                updateAuthState("AUTH_ERROR" as AuthState, "SIGNOUT_FAILED");
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
  }, [syncUser, updateAuthState, clearSession, detectCurrentProduct]);

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
