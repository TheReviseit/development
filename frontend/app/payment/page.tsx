/**
 * /payment — Billing Recovery Page
 * =================================
 * Shown when subscription is suspended, expired, past_due, or missing.
 *
 * Architecture (fixed):
 *   - "use client" — reads domain from browser (port/subdomain) directly
 *   - Uses PricingCards (same as public /pricing page) — proven working
 *   - Passes user email/name/phone/userId for Razorpay prefill
 *   - Domain detected from browser window.location (port-based in dev)
 */

"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import PricingCards from "../components/PricingCards/PricingCards";
import SpaceshipLoader from "../components/loading/SpaceshipLoader";
import logo from "@/public/logo.png";

// ─── Detect product domain from browser (port-based in dev) ──────────────────
function detectDomainFromBrowser(): string {
  if (typeof window === "undefined") return "shop";
  const port = window.location.port;
  const host = window.location.hostname;

  // Development: port-based
  if (port === "3001") return "shop";
  if (port === "3002") return "showcase";
  if (port === "3003") return "marketing";
  if (port === "3004") return "api";

  // Production: subdomain-based
  if (host.startsWith("shop.")) return "shop";
  if (host.startsWith("marketing.")) return "marketing";
  if (host.startsWith("showcase.")) return "showcase";
  if (host.startsWith("api.")) return "api";

  // Default: shop (the primary paying product)
  return "shop";
}

// ─── Reason → Copy Map ───────────────────────────────────────────────────────
const headlineMap: Record<string, string> = {
  suspended:       "Restore your account access",
  past_due:        "Update your payment to continue",
  halted:          "Restart your subscription",
  cancelled:       "Choose a plan to get back on track",
  expired:         "Renew your subscription",
  no_subscription: "Start your Flowauxi journey",
  unknown:         "Restore your account access",
};

const subtextMap: Record<string, string> = {
  suspended:
    "Your account has been suspended due to a missed payment. Select a plan below to restore full access instantly.",
  past_due:
    "Your subscription period has ended. Pick your plan and complete payment to continue without interruption.",
  halted:
    "Your subscription was halted by Razorpay. Start a fresh subscription below to resume all features.",
  cancelled:
    "Your subscription has been cancelled. Choose a plan below to get full access back.",
  expired:
    "Your subscription has expired. Pick a plan below and complete payment to unlock all dashboard features.",
  no_subscription:
    "You don't have an active subscription. Choose the plan that best fits your business needs.",
  unknown:
    "Please choose a plan below to restore or start your subscription.",
};

const badgeMap: Record<string, string> = {
  suspended:       "Account Suspended",
  past_due:        "Payment Overdue",
  halted:          "Subscription Halted",
  cancelled:       "Subscription Cancelled",
  expired:         "Subscription Expired",
  no_subscription: "No Active Plan",
  unknown:         "Action Required",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PaymentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const reason = searchParams.get("reason") || "expired";
  const isRecovery = reason !== "no_subscription";

  const headline = headlineMap[reason] ?? headlineMap.unknown;
  const subtext   = subtextMap[reason]  ?? subtextMap.unknown;
  const badge     = badgeMap[reason]    ?? badgeMap.unknown;

  // ─── Auth State ─────────────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── Domain — detected from browser ─────────────────────────────────────────
  const [domain, setDomain] = useState<string>("shop");

  useEffect(() => {
    // Detect from browser (runs after hydration)
    setDomain(detectDomainFromBrowser());

    // Firebase auth listener
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ─── Handle successful subscription ─────────────────────────────────────────
  const handleSubscriptionSuccess = (planName: string) => {
    // Dispatch event so BillingLockScreen re-checks billing status
    window.dispatchEvent(new Event("subscription-updated"));
    // Navigate back to dashboard
    router.push("/dashboard");
  };

  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#030303",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <SpaceshipLoader text="Loading..." />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030303",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif",
    }}>

      {/* ─── Navigation Bar ─────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        width: "100%",
        background: "rgba(3, 3, 3, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "60px",
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
            <Image src={logo} alt="Flowauxi" width={26} height={26} />
            <span style={{ fontSize: "15px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em" }}>
              Flowauxi
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <a href="mailto:support@flowauxi.com" style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.4)",
              textDecoration: "none",
              padding: "8px 14px",
            }}>
              Support
            </a>
            {user && (
              <Link href="/dashboard" style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero / Context Header ──────────────────────────────────────── */}
      <div style={{
        width: "100%",
        padding: "64px 24px 48px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute",
          top: "-80px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "500px",
          height: "300px",
          background: "radial-gradient(ellipse at center, rgba(220,38,38,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", maxWidth: "620px", margin: "0 auto" }}>
          {/* Status pill */}
          {isRecovery && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "5px 14px",
              borderRadius: "100px",
              background: "rgba(220,38,38,0.1)",
              border: "1px solid rgba(220,38,38,0.2)",
              marginBottom: "20px",
            }}>
              <span style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#ef4444",
                display: "inline-block",
                animation: "pulseAnim 2s ease-in-out infinite",
              }} />
              <span style={{
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#f87171",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                {badge}
              </span>
            </div>
          )}

          {/* Headline */}
          <h1 style={{
            margin: "0 0 16px",
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            color: "#ffffff",
            lineHeight: 1.2,
          }}>
            {headline}
          </h1>

          {/* Subtext */}
          <p style={{
            margin: 0,
            fontSize: "16px",
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.45)",
            maxWidth: "480px",
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            {subtext}
          </p>

          {/* Locked feature pills */}
          {isRecovery && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "28px",
            }}>
              {["Messages", "Campaigns", "Analytics", "AI Bot", "Templates", "Store"].map((f) => (
                <span key={f} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 12px",
                  borderRadius: "100px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.35)",
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  {f}
                </span>
              ))}
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", padding: "4px 12px" }}>
                → All unlocked instantly after payment
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Divider ──────────────────────────────────────────────────── */}
      <div style={{ width: "100%", maxWidth: "1100px", margin: "0 auto 0", padding: "0 24px" }}>
        <div style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
        }} />
      </div>

      {/* ─── Plan Selection (PricingCards) ────────────────────────────── */}
      <div style={{ flex: 1, width: "100%", maxWidth: "1100px", margin: "0 auto", padding: "32px 24px 80px" }}>
        <p style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.2)",
          marginBottom: "32px",
          textAlign: "center",
        }}>
          Select your plan to continue
        </p>

        {/*
          PricingCards — the same component used on the public /pricing page.
          It uses createSubscription() → openRazorpayCheckout() → verifyPayment()
          and redirects to /payment/status on success.

          Key: we pass domain explicitly so it doesn't fall back to auto-detection,
          and pass user info for Razorpay prefill.
        */}
        <PricingCards
          domain={domain as any}
          userEmail={user?.email ?? undefined}
          userName={user?.displayName ?? undefined}
          userId={user?.uid ?? undefined}
          onSubscriptionSuccess={handleSubscriptionSuccess}
          theme="dark"
        />
      </div>

      {/* ─── Footer ────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "24px",
        textAlign: "center",
      }}>
        <p style={{
          margin: 0,
          fontSize: "12px",
          color: "rgba(255,255,255,0.2)",
          lineHeight: 1.6,
        }}>
          Payments are processed securely via{" "}
          <span style={{ color: "rgba(255,255,255,0.4)" }}>Razorpay</span>.
          {" "}Your subscription activates within seconds of payment.
          <br />
          Need help?{" "}
          <a href="mailto:support@flowauxi.com" style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
            support@flowauxi.com
          </a>
          {" "}or{" "}
          <a href="https://wa.me/916383634873" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.35)", textDecoration: "none" }}>
            WhatsApp us
          </a>.
        </p>
      </footer>

      <style>{`
        @keyframes pulseAnim {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
