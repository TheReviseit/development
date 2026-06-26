export const VERIFY_EMAIL_DISPATCH_STATUS_KEY = "flowauxi:verify-email-dispatch";
export const VERIFY_EMAIL_EXPIRES_AT_KEY = "flowauxi:verify-email-expires-at";

export type VerifyEmailDispatchStatus = "sending" | "sent" | "failed";

export function setVerifyEmailDispatchStatus(status: VerifyEmailDispatchStatus): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(VERIFY_EMAIL_DISPATCH_STATUS_KEY, status);
}

export function readVerifyEmailDispatchStatus(): VerifyEmailDispatchStatus | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(VERIFY_EMAIL_DISPATCH_STATUS_KEY);
  if (value === "sending" || value === "sent" || value === "failed") {
    return value;
  }
  return null;
}

export function clearVerifyEmailDispatchStatus(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(VERIFY_EMAIL_DISPATCH_STATUS_KEY);
}

export function setVerifyEmailExpiresAt(iso: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(VERIFY_EMAIL_EXPIRES_AT_KEY, iso);
}

export function readVerifyEmailExpiresAt(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(VERIFY_EMAIL_EXPIRES_AT_KEY);
}

export function clearVerifyEmailExpiresAt(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(VERIFY_EMAIL_EXPIRES_AT_KEY);
}

export function formatExpiryCountdown(expiresAtIso: string, nowMs = Date.now()): string | null {
  const expiresMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresMs)) return null;
  const remainingMs = expiresMs - nowMs;
  if (remainingMs <= 0) return "Expired";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
