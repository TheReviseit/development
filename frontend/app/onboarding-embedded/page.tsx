/**
 * Simplified Onboarding Page with Embedded Signup
 * Uses Meta's Configuration for streamlined WhatsApp connection
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import EmbeddedSignupButton from "../components/facebook/EmbeddedSignupButton";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import "../onboarding/onboarding.css";

export default function OnboardingPageEmbedded() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    summary?: any;
  }>({ connected: false });
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check if user already completed onboarding
        await checkConnection();
        setLoading(false);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const checkConnection = async () => {
    try {
      const response = await fetch("/api/facebook/login");
      const data = await response.json();

      if (data.connected) {
        // Already connected - check if onboarding is complete
        const onboardingResponse = await fetch("/api/onboarding/check");
        const onboardingData = await onboardingResponse.json();

        if (onboardingData.onboardingCompleted) {
          router.push("/dashboard");
        } else {
          setConnectionStatus({ connected: true });
        }
      }
    } catch (error) {
      console.error("Error checking connection:", error);
    }
  };

  const handleConnectionSuccess = async () => {
    // Mark onboarding as complete
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  const handleConnectionError = (error: string) => {
    console.error("Connection error:", error);
  };

  if (loading) {
    return <SpaceshipLoader text="Loading" />;
  }

  return (
    <div className="onboarding-container onboarding-embedded">
      {/* Left Sidebar */}
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        <div className="sidebar-header">
          <h1>Connect WhatsApp Business</h1>
          <p className="sidebar-description">
            Streamlined setup powered by Meta. Connect your WhatsApp Business
            Account in one simple step.
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
              <span>Your own WhatsApp Business Account</span>
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
            Your WhatsApp Business Account credentials remain with Meta. We
            only access what you explicitly authorize.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="onboarding-main onboarding-main-embedded">
        {/* Mobile Header */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        {/* Main Content */}
        <div className="embedded-content">
          <div className="embedded-card">
            <div className="embedded-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>

            <h2>Connect Your WhatsApp Business</h2>
            <p className="embedded-description">
              Click the button below to securely connect your WhatsApp Business
              Account. Meta will guide you through selecting your Business
              Manager, WhatsApp Account, and phone number.
            </p>

            <div className="embedded-action">
              <EmbeddedSignupButton
                onSuccess={handleConnectionSuccess}
                onError={handleConnectionError}
              />
            </div>

            <div className="embedded-steps">
              <h4>What happens next:</h4>
              <ol>
                <li>Meta's secure popup opens</li>
                <li>Select your Business Manager</li>
                <li>Choose your WhatsApp Business Account</li>
                <li>Pick a phone number</li>
                <li>Grant permissions</li>
                <li>You're done! 🎉</li>
              </ol>
            </div>
          </div>

          <div className="embedded-footer">
            <p>
              Need help?{" "}
              <a href="/docs" target="_blank">
                View Documentation
              </a>
            </p>
            <p className="embedded-footer-note">
              By connecting, you agree to our{" "}
              <a href="/terms" target="_blank">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        .onboarding-embedded .embedded-features {
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

        .onboarding-main-embedded {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .embedded-content {
          max-width: 600px;
          width: 100%;
        }

        .embedded-card {
          background: white;
          border-radius: 16px;
          padding: 48px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          text-align: center;
        }

        .embedded-icon {
          width: 80px;
          height: 80px;
          margin: 0 auto 24px;
          background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .embedded-card h2 {
          font-size: 28px;
          font-weight: 700;
          color: #212529;
          margin: 0 0 12px 0;
        }

        .embedded-description {
          font-size: 16px;
          color: #6c757d;
          line-height: 1.6;
          margin: 0 0 32px 0;
        }

        .embedded-action {
          margin-bottom: 32px;
        }

        .embedded-steps {
          text-align: left;
          background: #f8f9fa;
          border-radius: 8px;
          padding: 24px;
          margin-top: 32px;
        }

        .embedded-steps h4 {
          font-size: 14px;
          font-weight: 600;
          color: #212529;
          margin: 0 0 16px 0;
        }

        .embedded-steps ol {
          margin: 0;
          padding-left: 20px;
          color: #495057;
        }

        .embedded-steps li {
          padding: 4px 0;
          font-size: 14px;
        }

        .embedded-footer {
          text-align: center;
          margin-top: 32px;
          font-size: 14px;
          color: #6c757d;
        }

        .embedded-footer p {
          margin: 8px 0;
        }

        .embedded-footer a {
          color: #1877f2;
          text-decoration: none;
        }

        .embedded-footer a:hover {
          text-decoration: underline;
        }

        .embedded-footer-note {
          font-size: 12px;
          color: #adb5bd;
        }

        @media (max-width: 768px) {
          .embedded-card {
            padding: 32px 24px;
          }

          .embedded-card h2 {
            font-size: 24px;
          }
        }
      `}</style>
    </div>
  );
}

