"use client";

import { auth } from "@/src/firebase/firebase";
import {
  clearOnboardingRedirectLoop,
  invalidateOnboardingCheckCache,
  OnboardingCheckError,
} from "@/lib/auth/onboarding-check-client";

const AUTH_RECOVERY_STORAGE_KEYS = [
  "sidebar-hidden-items",
  "pending_onboarding",
  "ai-capabilities-cache",
];

export function isMissingDbUserError(error: unknown) {
  if (!(error instanceof OnboardingCheckError)) return false;
  const data = error.data as { code?: unknown; error?: unknown } | null;
  return (
    error.status === 404 ||
    data?.code === "USER_NOT_FOUND" ||
    data?.error === "USER_NOT_FOUND"
  );
}

export function isInvalidSessionError(error: unknown) {
  if (!(error instanceof OnboardingCheckError)) return false;
  const data = error.data as { code?: unknown; error?: unknown } | null;
  return (
    error.status === 401 ||
    data?.code === "INVALID_TOKEN" ||
    data?.code === "TOKEN_VERIFICATION_FAILED" ||
    data?.error === "Unauthorized"
  );
}

export async function clearInvalidClientSession(reason: string) {
  console.warn(`[AUTH_RECOVERY] Clearing invalid client session: ${reason}`);
  invalidateOnboardingCheckCache();
  clearOnboardingRedirectLoop();

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    console.error("[AUTH_RECOVERY] Failed to clear server session:", error);
  }

  try {
    for (const key of AUTH_RECOVERY_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.error("[AUTH_RECOVERY] Failed to clear browser storage:", error);
  }

  try {
    await auth.signOut();
  } catch (error) {
    console.error("[AUTH_RECOVERY] Failed to sign out Firebase:", error);
  }
}

export function hardRedirectToLogin(error: "account_not_found" | "session_expired" | "auth_error") {
  const params = new URLSearchParams({ error });
  if (error === "account_not_found") {
    params.set(
      "message",
      "Your account no longer exists. Please sign up again to continue.",
    );
  }

  window.location.replace(`/login?${params.toString()}`);
}
