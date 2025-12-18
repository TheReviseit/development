/**
 * Simplified Onboarding Page with Two-Step Connection Flow
 *
 * Uses the Meta-approved 2-step architecture:
 * Step 1: Facebook Login for Business (business_management permission)
 * Step 2: WhatsApp Embedded Signup (whatsapp_business_management + messaging)
 *
 * The original single-step approach has been replaced with the proper 2-step flow
 * to fix the "No WhatsApp Business Account found" error and ensure proper permission handling.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import TwoStepConnectionFlow from "../components/facebook/TwoStepConnectionFlow";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import "../onboarding/onboarding.css";

export default function OnboardingPageEmbedded() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 🔍 FACEBOOK REDIRECT DEBUG - Capture the exact redirect URI
    console.group("🔍 FACEBOOK REDIRECT DEBUG");
    console.log("➡️ Full browser URL:", window.location.href);
    console.log("➡️ Pathname:", window.location.pathname);
    console.log("➡️ Search Params:", window.location.search);
    console.log("➡️ Hash:", window.location.hash);
    console.log(
      "🔐 redirect_uri sent back by Facebook:",
      window.location.origin + window.location.pathname
    );
    console.log("🔍 AUTH URL USED BY FACEBOOK:", window.location.href);
    console.log("🔍 FULL REDIRECT URI SENT TO BACKEND:", {
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      full:
        window.location.origin +
        window.location.pathname +
        window.location.search +
        window.location.hash,
    });
    console.groupEnd();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check if user already completed onboarding
        await checkOnboardingStatus();
        setLoading(false);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const checkOnboardingStatus = async () => {
    try {
      const onboardingResponse = await fetch("/api/onboarding/check");
      const onboardingData = await onboardingResponse.json();

      if (onboardingData.onboardingCompleted) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
    }
  };

  if (loading) {
    return <SpaceshipLoader text="Loading" />;
  }

  return (
    <div className="onboarding-container onboarding-two-step">
      {/* Left Sidebar */}
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        <div className="sidebar-header">
          <h1>Connect WhatsApp Business</h1>
          <p className="sidebar-description">
            Complete two quick steps to connect your WhatsApp Business Account
            using Meta's official flow.
          </p>
        </div>

        <div className="embedded-features">
          <h3>Two Simple Steps:</h3>
          <ul>
            <li>
              <div className="step-number-badge">1</div>
              <div>
                <strong>Connect Business Manager</strong>
                <span>Log in with Facebook to access your businesses</span>
              </div>
            </li>
            <li>
              <div className="step-number-badge">2</div>
              <div>
                <strong>Connect WhatsApp</strong>
                <span>Select your WABA and phone number</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="embedded-features" style={{ marginTop: 24 }}>
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

      {/* Right Panel - Two Step Flow */}
      <div className="onboarding-main onboarding-main-embedded">
        {/* Mobile Header */}
        <div className="mobile-header">
          <img src="/logo.png" alt="Revise It Logo" />
          <span>Revise It</span>
        </div>

        {/* Main Content - TwoStepConnectionFlow handles everything */}
        <div className="embedded-content">
          <TwoStepConnectionFlow />
        </div>
      </div>

      <style jsx>{`
        .onboarding-two-step .embedded-features {
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
          align-items: flex-start;
          gap: 12px;
          padding: 12px 0;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
        }

        .embedded-features li svg {
          flex-shrink: 0;
          color: #10b981;
          margin-top: 2px;
        }

        .embedded-features li div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .embedded-features li strong {
          color: rgba(255, 255, 255, 0.95);
          font-weight: 600;
        }

        .embedded-features li span {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }

        .step-number-badge {
          width: 24px;
          height: 24px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 12px;
          color: white;
          flex-shrink: 0;
        }

        .onboarding-main-embedded {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px;
          overflow-y: auto;
        }

        .embedded-content {
          max-width: 800px;
          width: 100%;
          padding: 20px 0;
        }

        @media (max-width: 768px) {
          .onboarding-main-embedded {
            padding: 20px;
          }

          .embedded-content {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
