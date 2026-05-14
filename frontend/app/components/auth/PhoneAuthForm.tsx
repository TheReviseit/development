"use client";

import { useState, useEffect, useRef } from "react";
import { useFirebaseAuth } from "@/lib/hooks/useFirebaseAuth";

interface PhoneAuthFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const OTP_LENGTH = 6;
const E164_PHONE_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Phone Authentication Form Component
 * Two-step flow: Send OTP → Verify OTP
 */
export default function PhoneAuthForm({
  onSuccess,
  onError,
}: PhoneAuthFormProps) {
  const { sendPhoneOTP, verifyPhoneOTP, loading, error } = useFirebaseAuth();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countdown, setCountdown] = useState(0);
  const [localError, setLocalError] = useState("");
  const [otpStatus, setOtpStatus] = useState<"idle" | "verifying" | "verified">(
    "idle",
  );
  const verifyInFlightRef = useRef(false);

  const isOtpLocked =
    loading || otpStatus === "verifying" || otpStatus === "verified";
  const isOtpComplete = otpCode.length === OTP_LENGTH;
  const displayError = localError || error;

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const reportError = (message: string) => {
    setLocalError(message);
    onError?.(message);
  };

  const normalizePhoneNumber = (value: string) => {
    const withoutSeparators = value
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");

    return withoutSeparators.startsWith("+")
      ? withoutSeparators
      : `+${withoutSeparators}`;
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const formattedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!E164_PHONE_RE.test(formattedPhoneNumber)) {
      reportError("Kindly enter a valid phone number with country code.");
      return;
    }

    setLocalError("");

    try {
      await sendPhoneOTP(formattedPhoneNumber);
      setPhoneNumber(formattedPhoneNumber);
      setStep("otp");
      setCountdown(60); // 60 second cooldown
    } catch (err: any) {
      reportError(err.message || "Unable to send the verification code.");
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (verifyInFlightRef.current || isOtpLocked) return;

    if (!isOtpComplete) {
      reportError("Kindly enter the complete 6-digit verification code.");
      return;
    }

    setLocalError("");
    setOtpStatus("verifying");
    verifyInFlightRef.current = true;

    try {
      await verifyPhoneOTP(otpCode);
      setOtpStatus("verified");
      onSuccess?.();
    } catch (err: any) {
      setOtpStatus("idle");
      verifyInFlightRef.current = false;
      setOtpCode("");
      reportError(
        err.message || "The verification code is incorrect or expired.",
      );
    }
  };

  const handleResendOTP = async () => {
    if (loading || countdown > 0 || otpStatus === "verified") return;

    setLocalError("");

    try {
      await sendPhoneOTP(phoneNumber);
      setCountdown(60);
      setOtpCode("");
      setOtpStatus("idle");
    } catch (err: any) {
      reportError(err.message || "Unable to resend the verification code.");
    }
  };

  const handleBack = () => {
    if (isOtpLocked) return;

    setStep("phone");
    setOtpCode("");
    setLocalError("");
    setOtpStatus("idle");
    verifyInFlightRef.current = false;
  };

  return (
    <div className="w-full max-w-md">
      {step === "phone" ? (
        <form onSubmit={handleSendOTP} className="space-y-4">
          <div>
            <label
              htmlFor="phone"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setLocalError("");
              }}
              placeholder="+1234567890"
              required
              autoComplete="tel"
              className="
                w-full px-4 py-3 
                border border-gray-300 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                placeholder-gray-400
              "
            />
            <p className="mt-1 text-xs text-gray-500">
              Include country code (e.g., +1 for US, +91 for India)
            </p>
          </div>

          {/* reCAPTCHA container */}
          <div id="recaptcha-container"></div>

          <button
            type="submit"
            disabled={loading || !phoneNumber}
            className="
              w-full px-6 py-3
              bg-blue-600 text-white rounded-lg
              font-medium
              hover:bg-blue-700
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            "
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Sending OTP...</span>
              </div>
            ) : (
              "Send OTP"
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <div>
            <label
              htmlFor="otp"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Enter OTP Code
            </label>
            <input
              id="otp"
              type="text"
              value={otpCode}
              onChange={(e) => {
                setOtpCode(
                  e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH),
                );
                setLocalError("");
              }}
              placeholder="123456"
              maxLength={OTP_LENGTH}
              required
              disabled={isOtpLocked}
              autoComplete="one-time-code"
              inputMode="numeric"
              aria-invalid={Boolean(displayError)}
              className="
                w-full px-4 py-3 
                border border-gray-300 rounded-lg
                text-center text-2xl font-mono tracking-widest
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              "
            />
            <p className="mt-1 text-xs text-gray-500 text-center">
              OTP sent to {phoneNumber}
            </p>
          </div>

          <button
            type="submit"
            disabled={isOtpLocked || !isOtpComplete}
            className="
              w-full px-6 py-3
              bg-blue-600 text-white rounded-lg
              font-medium
              hover:bg-blue-700
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            "
          >
            {otpStatus === "verified" ? (
              "Verified"
            ) : isOtpLocked ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying...</span>
              </div>
            ) : (
              "Verify OTP"
            )}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleBack}
              disabled={isOtpLocked}
              className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Change Number
            </button>

            {countdown > 0 ? (
              <span className="text-gray-500">Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading || otpStatus === "verified"}
                className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            )}
          </div>
        </form>
      )}

      {displayError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{displayError}</p>
        </div>
      )}
    </div>
  );
}
