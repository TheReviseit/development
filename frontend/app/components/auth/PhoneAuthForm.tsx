"use client";

import { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/hooks/useFirebaseAuth";

interface PhoneAuthFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

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

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await sendPhoneOTP(phoneNumber);
      setStep("otp");
      setCountdown(60); // 60 second cooldown
    } catch (err: any) {
      if (onError) onError(err.message);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await verifyPhoneOTP(otpCode);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      if (onError) onError(err.message);
    }
  };

  const handleResendOTP = async () => {
    try {
      await sendPhoneOTP(phoneNumber);
      setCountdown(60);
      setOtpCode("");
    } catch (err: any) {
      if (onError) onError(err.message);
    }
  };

  const handleBack = () => {
    setStep("phone");
    setOtpCode("");
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
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              required
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
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              maxLength={6}
              required
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
            disabled={loading || otpCode.length !== 6}
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
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Change Number
            </button>

            {countdown > 0 ? (
              <span className="text-gray-500">Resend in {countdown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                Resend OTP
              </button>
            )}
          </div>
        </form>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
