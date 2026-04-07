"use client";

import { useState, useCallback, useEffect } from "react";
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import type { SyncUserResponse } from "@/types/auth.types";
import {
  signInWithGoogleHybrid,
  checkRedirectResult,
  classifyAuthError,
  shouldPreferRedirect,
  getRecommendedConfig,
  clearAuthState,
  shouldCheckRedirectResult,
  type AuthAttemptResult,
} from "@/lib/auth/firebase-auth";

/**
 * Custom hook for Firebase authentication with automatic Supabase sync
 * 
 * PRODUCTION FEATURES:
 * - Automatic popup/redirect hybrid strategy
 * - Redirect result handling on mount
 * - Comprehensive error classification
 * - Mobile/WebView detection with redirect preference
 * - Automatic retry with fallback
 */
export function useFirebaseAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [isRedirectPending, setIsRedirectPending] = useState(false);

  /**
   * Check for redirect result on mount (handles redirect auth flow)
   * Only runs if we detect we're returning from a redirect
   */
  useEffect(() => {
    // Only check redirect result if we detect we're returning from a redirect
    if (!shouldCheckRedirectResult()) {
      console.log("[useFirebaseAuth] No redirect detected, skipping check");
      return;
    }

    const handleRedirectResult = async () => {
      // Only check if we're not already loading
      if (loading) return;

      try {
        setLoading(true);
        setIsRedirectPending(true);
        
        console.log("[useFirebaseAuth] Checking redirect result...");
        const result = await checkRedirectResult(auth);

        if (result.success && result.user) {
          // Redirect auth completed successfully
          console.log("[useFirebaseAuth] Redirect result successful");
          
          // Sync to Supabase
          try {
            const supabaseUser = await syncUserToSupabase(result.user.user);
            setLoading(false);
            setIsRedirectPending(false);
            return { user: result.user.user, supabaseUser, fromRedirect: true };
          } catch (syncError) {
            console.error("[useFirebaseAuth] Supabase sync error:", syncError);
            setError("Authentication successful but failed to sync user data.");
            setLoading(false);
            setIsRedirectPending(false);
          }
        } else if (result.error) {
          // Redirect auth failed
          const errorAnalysis = classifyAuthError(result.error);
          console.error("[useFirebaseAuth] Redirect result error:", errorAnalysis);
          setError(errorAnalysis.userMessage);
          setLoading(false);
          setIsRedirectPending(false);
        } else {
          // No result - normal page load
          console.log("[useFirebaseAuth] No redirect result found");
          setLoading(false);
          setIsRedirectPending(false);
        }
      } catch (err) {
        console.error("[useFirebaseAuth] Error checking redirect result:", err);
        setLoading(false);
        setIsRedirectPending(false);
      }
    };

    handleRedirectResult();
  }, []); // Run once on mount

  /**
   * Call the sync API to sync user to Supabase
   */
  const syncUserToSupabase = useCallback(async (user: FirebaseUser) => {
    try {
      const idToken = await user.getIdToken();

      const response = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to sync user to Supabase");
      }

      const data: SyncUserResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Sync failed");
      }

      return data.user;
    } catch (err: any) {
      console.error("Supabase sync error:", err);
      throw err;
    }
  }, []);

  /**
   * Sign in with Google using hybrid popup/redirect strategy
   * 
   * Automatically handles:
   * - Popup blocking detection
   * - Mobile/WebView redirect preference
   * - Retry with fallback
   * - Comprehensive error handling
   */
  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsRedirectPending(false);

    try {
      // Get environment-optimized config
      const envConfig = getRecommendedConfig();
      
      // Check if we should prefer redirect (mobile/WebView)
      if (shouldPreferRedirect()) {
        console.log("[useFirebaseAuth] Mobile/WebView detected, using redirect");
        setIsRedirectPending(true);
      }

      const result = await signInWithGoogleHybrid(auth, envConfig);

      // Handle redirect case (page will navigate away)
      if (result.method === "redirect" && !result.error) {
        setIsRedirectPending(true);
        // Page is about to redirect, keep loading state
        return null;
      }

      // Handle popup success
      if (result.success && result.user) {
        const user = result.user.user;
        
        // Sync to Supabase
        const supabaseUser = await syncUserToSupabase(user);

        setLoading(false);
        return { user, supabaseUser };
      }

      // Handle failure
      if (result.error) {
        const errorAnalysis = classifyAuthError(result.error);
        setError(errorAnalysis.userMessage);
        throw new Error(errorAnalysis.userMessage);
      }

      throw new Error("Unknown authentication error");
    } catch (err: any) {
      setLoading(false);
      setIsRedirectPending(false);

      // Provide specific error messages
      let errorMessage = "Failed to sign in with Google";

      if (err.code === "auth/popup-closed-by-user") {
        errorMessage =
          "Sign-in cancelled. Please complete the Google sign-in process.";
      } else if (err.code === "auth/popup-blocked") {
        errorMessage = "Pop-up blocked. Falling back to redirect...";
        // Trigger redirect fallback manually if needed
        setIsRedirectPending(true);
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMessage =
          "Sign-in cancelled. Please wait for the current request to complete.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message && err.message.includes("initial state")) {
        errorMessage =
          "Browser storage issue. Please enable cookies and try again.";
      } else {
        errorMessage = err.message || "Failed to sign in with Google";
      }

      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [syncUserToSupabase]);

  /**
   * Initialize reCAPTCHA verifier for phone auth
   */
  const initializeRecaptcha = useCallback(
    (elementId: string = "recaptcha-container") => {
      try {
        // Clear existing verifier
        if ((window as any).recaptchaVerifier) {
          (window as any).recaptchaVerifier.clear();
        }

        const verifier = new RecaptchaVerifier(auth, elementId, {
          size: "normal",
          callback: () => {
            console.log("reCAPTCHA solved");
          },
          "expired-callback": () => {
            console.log("reCAPTCHA expired");
            setError("reCAPTCHA expired. Please try again.");
          },
        });

        (window as any).recaptchaVerifier = verifier;
        return verifier;
      } catch (err: any) {
        console.error("reCAPTCHA initialization error:", err);
        setError("Failed to initialize reCAPTCHA");
        throw err;
      }
    },
    []
  );

  /**
   * Send OTP to phone number
   */
  const sendPhoneOTP = useCallback(
    async (phoneNumber: string) => {
      setLoading(true);
      setError(null);

      try {
        // Ensure phone number has country code
        const formattedPhone = phoneNumber.startsWith("+")
          ? phoneNumber
          : `+${phoneNumber}`;

        const recaptchaVerifier = initializeRecaptcha();
        const confirmation = await signInWithPhoneNumber(
          auth,
          formattedPhone,
          recaptchaVerifier
        );

        setConfirmationResult(confirmation);
        setLoading(false);
        return confirmation;
      } catch (err: any) {
        setLoading(false);
        const errorMessage = err.message || "Failed to send OTP";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [initializeRecaptcha]
  );

  /**
   * Verify OTP code
   */
  const verifyPhoneOTP = useCallback(
    async (code: string) => {
      if (!confirmationResult) {
        throw new Error("No confirmation result. Please send OTP first.");
      }

      setLoading(true);
      setError(null);

      try {
        const result = await confirmationResult.confirm(code);
        const user = result.user;

        // Sync to Supabase
        const supabaseUser = await syncUserToSupabase(user);

        setLoading(false);
        setConfirmationResult(null);
        return { user, supabaseUser };
      } catch (err: any) {
        setLoading(false);
        const errorMessage = err.message || "Invalid OTP code";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [confirmationResult, syncUserToSupabase]
  );

  /**
   * Sign in with email and password
   */
  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;

        // Sync to Supabase
        const supabaseUser = await syncUserToSupabase(user);

        setLoading(false);
        return { user, supabaseUser };
      } catch (err: any) {
        setLoading(false);
        const errorMessage = err.message || "Failed to sign in";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [syncUserToSupabase]
  );

  /**
   * Sign up with email and password
   */
  const signUpWithEmail = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = result.user;

        // Update display name if provided
        if (fullName) {
          await updateProfile(user, {
            displayName: fullName,
          });
        }

        // Sync to Supabase
        const supabaseUser = await syncUserToSupabase(user);

        setLoading(false);
        return { user, supabaseUser };
      } catch (err: any) {
        setLoading(false);
        const errorMessage = err.message || "Failed to sign up";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    [syncUserToSupabase]
  );

  /**
   * Sign out
   */
  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await auth.signOut();
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      const errorMessage = err.message || "Failed to sign out";
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    isRedirectPending,
    signInWithGoogle,
    sendPhoneOTP,
    verifyPhoneOTP,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    syncUserToSupabase,
    clearError,
  };
}
