"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import { usePredictivePreload } from "@/app/utils/authPerformance";

/**
 * Production-grade authentication state and redirect hook
 * Optimized for performance with caching and parallel checks
 */

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  onboardingCompleted: boolean | null;
  userId: string | null;
}

// In-memory cache for onboarding status to prevent redundant API calls
const onboardingCache = new Map<
  string,
  { status: boolean; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Check onboarding status with intelligent caching
 */
async function checkOnboardingStatus(userId: string): Promise<boolean> {
  // Check cache first
  const cached = onboardingCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.status;
  }

  try {
    const response = await fetch("/api/onboarding/check", {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!response.ok) {
      console.warn("Onboarding check failed, defaulting to false");
      return false;
    }

    const data = await response.json();
    const status = data.onboardingCompleted ?? false;

    // Update cache
    onboardingCache.set(userId, { status, timestamp: Date.now() });

    return status;
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return false; // Default to onboarding required on error
  }
}

/**
 * Custom hook for authentication state and smart redirects
 */
export function useAuthRedirect() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    onboardingCompleted: null,
    userId: null,
  });
  const router = useRouter();

  // Predictive preloading for instant navigation
  usePredictivePreload(
    authState.isAuthenticated,
    authState.onboardingCompleted,
  );

  useEffect(() => {
    // Subscribe to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // CRITICAL: Verify user exists in database before treating as authenticated
          const idToken = await user.getIdToken(true);
          const checkResponse = await fetch("/api/auth/check-user-exists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });

          if (checkResponse.ok) {
            const { exists } = await checkResponse.json();

            if (!exists) {
              // User deleted from DB but Firebase session exists - sign out
              console.log("User not found in DB, clearing stale session");
              await auth.signOut();
              setAuthState({
                isAuthenticated: false,
                isLoading: false,
                onboardingCompleted: null,
                userId: null,
              });
              return;
            }
          }

          // User exists - check onboarding status
          const onboardingCompleted = await checkOnboardingStatus(user.uid);

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            onboardingCompleted,
            userId: user.uid,
          });
        } catch (error) {
          console.error("Error loading auth state:", error);
          // On error, clear session to be safe
          try {
            await auth.signOut();
          } catch {}
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            onboardingCompleted: null,
            userId: null,
          });
        }
      } else {
        // User is not authenticated
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          onboardingCompleted: null,
          userId: null,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  /**
   * Smart redirect handler for Login button
   * - If authenticated + onboarding complete → Dashboard
   * - If authenticated + onboarding incomplete → Onboarding
   * - If not authenticated → Login page
   */
  const handleLoginClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();

      if (authState.isLoading) {
        return; // Don't navigate while loading
      }

      if (authState.isAuthenticated) {
        // User is already logged in
        if (authState.onboardingCompleted) {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      } else {
        // User is not logged in
        router.push("/login");
      }
    },
    [authState, router],
  );

  /**
   * Smart redirect handler for Get Started button
   * - If authenticated + onboarding complete → Dashboard
   * - If authenticated + onboarding incomplete → Onboarding
   * - If not authenticated → Signup page
   */
  const handleGetStartedClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();

      if (authState.isLoading) {
        return; // Don't navigate while loading
      }

      if (authState.isAuthenticated) {
        // User is already logged in
        if (authState.onboardingCompleted) {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      } else {
        // User is not logged in
        router.push("/signup");
      }
    },
    [authState, router],
  );

  /**
   * Invalidate onboarding cache for current user
   * Useful after completing onboarding
   */
  const invalidateOnboardingCache = useCallback(() => {
    if (authState.userId) {
      onboardingCache.delete(authState.userId);
    }
  }, [authState.userId]);

  return {
    ...authState,
    handleLoginClick,
    handleGetStartedClick,
    invalidateOnboardingCache,
  };
}

/**
 * Lightweight hook for just checking auth status
 * Use this when you only need to know if user is logged in
 */
export function useAuthStatus() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { isAuthenticated, isLoading };
}
