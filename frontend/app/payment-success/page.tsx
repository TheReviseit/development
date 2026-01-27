"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./payment-success.module.css";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "pending" | "failed">("loading");
  const [message, setMessage] = useState("Verifying your payment...");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const paymentId = searchParams.get("razorpay_payment_id");
    const paymentLinkId = searchParams.get("razorpay_payment_link_id");
    const paymentStatus = searchParams.get("razorpay_payment_link_status");
    const signature = searchParams.get("razorpay_signature");
    const referenceId = searchParams.get("razorpay_payment_link_reference_id");

    // Check if we have the required parameters
    if (!paymentId || !paymentLinkId) {
      setStatus("error");
      setMessage("Invalid payment parameters. Please contact support.");
      return;
    }

    // Handle different payment statuses
    if (paymentStatus === "paid") {
      setStatus("success");
      setMessage("Payment successful! Your order is being processed.");
      
      // Countdown timer
      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      // Redirect after 5 seconds
      const redirectTimer = setTimeout(() => {
        // Close the window/tab if opened in popup, or redirect
        if (window.opener) {
          window.close();
        } else {
          router.push("/");
        }
      }, 5000);

      return () => {
        clearInterval(countdownInterval);
        clearTimeout(redirectTimer);
      };
    } else if (paymentStatus === "pending") {
      setStatus("pending");
      setMessage("Your payment is being processed. Please wait while we confirm your payment.");
      return;
    } else if (paymentStatus === "failed" || paymentStatus === "cancelled") {
      setStatus("failed");
      setMessage("Payment failed. Please try again or contact support if the amount was deducted.");
      return;
    } else {
      setStatus("error");
      setMessage(`Payment status: ${paymentStatus || "unknown"}. Please contact support if you have completed the payment.`);
    }
  }, [searchParams, router]);

  return (
    <div className={styles.container}>
      <div className={styles.backgroundPattern}></div>
      <div className={styles.content}>
        {status === "loading" && (
          <div className={styles.stateContainer}>
            <div className={styles.iconWrapper}>
              <div className={styles.spinner}></div>
            </div>
            <h1 className={styles.title}>Verifying Payment</h1>
            <p className={styles.message}>{message}</p>
            <div className={styles.loadingDots}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        {status === "success" && (
          <div className={styles.stateContainer}>
            <div className={styles.iconWrapper}>
              <div className={styles.successIcon}>
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div className={styles.successRipple}></div>
                <div className={styles.successRipple}></div>
              </div>
            </div>
            <h1 className={styles.title}>Payment Successful!</h1>
            <p className={styles.message}>{message}</p>
            <div className={styles.redirectInfo}>
              <p className={styles.note}>
                Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
              </p>
              <button 
                onClick={() => {
                  if (window.opener) {
                    window.close();
                  } else {
                    router.push("/");
                  }
                }}
                className={styles.button}
              >
                Continue Now
              </button>
            </div>
          </div>
        )}
        
        {status === "pending" && (
          <div className={styles.stateContainer}>
            <div className={styles.iconWrapper}>
              <div className={styles.pendingIcon}>
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className={styles.pendingPulse}></div>
              </div>
            </div>
            <h1 className={styles.title}>Payment Pending</h1>
            <p className={styles.message}>{message}</p>
            <div className={styles.pendingInfo}>
              <p className={styles.note}>
                This may take a few minutes. You can close this window and we'll notify you once the payment is confirmed.
              </p>
              <div className={styles.pendingActions}>
                <button 
                  onClick={() => router.push("/")}
                  className={styles.buttonSecondary}
                >
                  Go to Home
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className={styles.stateContainer}>
            <div className={styles.iconWrapper}>
              <div className={styles.failedIcon}>
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
            </div>
            <h1 className={styles.title}>Payment Failed</h1>
            <p className={styles.message}>{message}</p>
            <div className={styles.failedActions}>
              <button 
                onClick={() => router.push("/")}
                className={styles.button}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
        
        {status === "error" && (
          <div className={styles.stateContainer}>
            <div className={styles.iconWrapper}>
              <div className={styles.errorIcon}>
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <h1 className={styles.title}>Payment Verification</h1>
            <p className={styles.message}>{message}</p>
            <div className={styles.errorActions}>
              <button 
                onClick={() => router.push("/")}
                className={styles.button}
              >
                Go to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <div className={styles.backgroundPattern}></div>
          <div className={styles.content}>
            <div className={styles.stateContainer}>
              <div className={styles.iconWrapper}>
                <div className={styles.spinner}></div>
              </div>
              <h1 className={styles.title}>Verifying Payment</h1>
              <p className={styles.message}>Loading...</p>
              <div className={styles.loadingDots}>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
