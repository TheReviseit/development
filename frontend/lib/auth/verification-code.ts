import { createHmac, randomInt } from "crypto";

export const VERIFICATION_OTP_TTL_MS = 30 * 60 * 1000;
export const MAX_VERIFICATION_ATTEMPTS = 3;
export const VERIFICATION_CODE_RE = /^\d{6}$/;

export function generateVerificationCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function verificationExpiresAt(nowMs = Date.now()): Date {
  return new Date(nowMs + VERIFICATION_OTP_TTL_MS);
}

export function hashVerificationCode(code: string): {
  codeHash: string;
  hashVersion: number;
} | null {
  const secret = process.env.VERIFY_OTP_HMAC_SECRET?.trim();
  if (!secret) return null;

  const codeHash = createHmac("sha256", secret).update(code).digest("hex");
  return { codeHash, hashVersion: 1 };
}

export function isVerifyOtpHashOnlyEnabled(): boolean {
  return process.env.VERIFY_OTP_HASH_ONLY === "true";
}

export function isVerifyEmailRpcEnabled(): boolean {
  return process.env.USE_VERIFY_EMAIL_RPC !== "false";
}
