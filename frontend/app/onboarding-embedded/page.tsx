/**
 * Simplified Onboarding Page - Single-Step WhatsApp Embedded Signup
 *
 * Uses Meta's Embedded Signup directly without requiring Business Manager connection first.
 * The Embedded Signup flow handles everything in one step:
 * - WhatsApp Business Account selection
 * - Phone number verification
 * - Permission grants
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import WhatsAppEmbeddedSignupForm from "../components/onboarding/WhatsAppEmbeddedSignupForm";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import "../onboarding/onboarding.css";
import "./onboarding-embedded.css";

export default function OnboardingPageEmbedded() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionComplete, setConnectionComplete] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check onboarding status before showing the page
        const shouldRedirect = await checkOnboardingStatus();
        // Only stop loading if we're not redirecting
        if (!shouldRedirect) {
          setLoading(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const checkOnboardingStatus = async (): Promise<boolean> => {
    try {
      const onboardingResponse = await fetch("/api/onboarding/check");
      const onboardingData = await onboardingResponse.json();

      if (onboardingData.onboardingCompleted) {
        router.push("/dashboard");
        return true; // Indicate that we're redirecting
      }
      return false; // Not redirecting, show onboarding
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      return false; // On error, show onboarding page
    }
  };

  const handleConnectionSuccess = async (data: {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    wabaName: string;
  }) => {
    console.log("✅ WhatsApp connected successfully:", data);
    setConnectionComplete(true);
    setConnectionError(null);

    // Mark onboarding as complete
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappConnected: true,
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
        }),
      });

      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  const handleConnectionError = (error: string) => {
    console.error("❌ WhatsApp connection error:", error);
    setConnectionError(error);
  };

  if (loading) {
    return <SpaceshipLoader text="Loading" />;
  }

  return (
    <div className="onboarding-container onboarding-two-step">
      {/* Left Sidebar */}
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Flowauxi Logo" />
          <span>Flowauxi</span>
        </div>

        <div className="sidebar-header">
          <h1>Connect WhatsApp Business</h1>
          <p className="sidebar-description">
            Connect your WhatsApp Business Account in one simple step using
            Meta's official Embedded Signup flow.
          </p>
        </div>

        <div className="embedded-features">
          <h3>What you'll get:</h3>
          <ul>
            <li>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span>Automated WhatsApp messaging</span>
            </li>
            <li>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span>AI-powered customer responses</span>
            </li>
            <li>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span>Real-time message tracking</span>
            </li>
            <li>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span>Secure connection via Meta</span>
            </li>
          </ul>
        </div>

        <div className="sidebar-note">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <p>
            Your WhatsApp Business Account credentials remain with Meta. We only
            access what you explicitly authorize.
          </p>
        </div>
      </div>

      {/* Right Panel - Single Step WhatsApp Embedded Signup */}
      <div className="onboarding-main onboarding-main-embedded">
        {/* Mobile Header */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Flowauxi Logo" />
          <span>Flowauxi</span>
        </div>

        {/* Main Content */}
        <div className="embedded-content">
          {connectionComplete ? (
            <div className="success-message">
              <div className="success-icon">✅</div>
              <h2>WhatsApp Connected Successfully!</h2>
              <p>Redirecting to your dashboard...</p>
            </div>
          ) : (
            <WhatsAppEmbeddedSignupForm
              onSuccess={handleConnectionSuccess}
              onError={handleConnectionError}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        .embedded-features {
          margin-top: 40px;
        }

        .embedded-features h3 {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 16px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .embedded-features ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .embedded-features li {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
        }

        .embedded-features li svg {
          flex-shrink: 0;
          color: #10b981;
        }

        .success-message {
          text-align: center;
          padding: 60px 40px;
          background: var(--card-bg, rgba(255, 255, 255, 0.05));
          border-radius: 16px;
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
        }

        .success-icon {
          font-size: 64px;
          margin-bottom: 24px;
        }

        .success-message h2 {
          color: #10b981;
          margin: 0 0 12px;
          font-size: 24px;
        }

        .success-message p {
          color: var(--text-secondary);
          margin: 0;
        }
      `}</style>
    </div>
  );
}
