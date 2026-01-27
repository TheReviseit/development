"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./payment-success.module.css";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your payment...");

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

    // If payment status is already "paid", show success
    if (paymentStatus === "paid") {
      setStatus("success");
      setMessage("Payment successful! Your order is being processed.");
      
      // Redirect after 3 seconds
      setTimeout(() => {
        // Close the window/tab if opened in popup, or redirect
        if (window.opener) {
          window.close();
        } else {
          router.push("/");
        }
      }, 3000);
    } else {
      setStatus("error");
      setMessage(`Payment status: ${paymentStatus || "unknown"}. Please contact support if you have completed the payment.`);
    }
  }, [searchParams, router]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {status === "loading" && (
          <>
            <div className={styles.spinner}></div>
            <h1 className={styles.title}>Verifying Payment...</h1>
            <p className={styles.message}>{message}</p>
          </>
        )}
        
        {status === "success" && (
          <>
            <div className={styles.successIcon}>✅</div>
            <h1 className={styles.title}>Payment Successful!</h1>
            <p className={styles.message}>{message}</p>
            <p className={styles.note}>
              You can close this window. Your order will be confirmed shortly.
            </p>
          </>
        )}
        
        {status === "error" && (
          <>
            <div className={styles.errorIcon}>❌</div>
            <h1 className={styles.title}>Payment Verification</h1>
            <p className={styles.message}>{message}</p>
            <button 
              onClick={() => router.push("/")}
              className={styles.button}
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
