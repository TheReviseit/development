"use client";

import { useState, useCallback } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
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

/**
 * Custom hook for Firebase authentication with automatic Supabase sync
 */
export function useFirebaseAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);

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
   * Sign in with Google
   */
  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Sync to Supabase
      const supabaseUser = await syncUserToSupabase(user);

      setLoading(false);
      return { user, supabaseUser };
    } catch (err: any) {
      setLoading(false);
      const errorMessage = err.message || "Failed to sign in with Google";
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

  return {
    loading,
    error,
    signInWithGoogle,
    sendPhoneOTP,
    verifyPhoneOTP,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    syncUserToSupabase,
  };
}
