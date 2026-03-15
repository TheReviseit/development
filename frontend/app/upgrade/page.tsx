/**
 * Universal Upgrade Page — Enterprise Multi-Domain Upgrade Flow
 * ============================================================
 *
 * Design: Professional, clean white background with black text/buttons
 * Architecture: Domain-aware, server-side rendered for SEO
 * Features: Plan comparison, smart recommendations, yearly billing savings
 *
 * Author: Claude Code
 * Quality: Production-ready, Vercel/Stripe quality
 */

import { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import UpgradeContainer from "./components/UpgradeContainer";
import ShopFooter from "../shop/components/ShopFooter";
import logo from "@/public/logo.png";

// Domain-specific metadata
const DOMAIN_TITLES: Record<string, string> = {
  shop: "Upgrade Your Shop Plan",
  marketing: "Upgrade Your Marketing Plan",
  api: "Upgrade Your API Plan",
  dashboard: "Upgrade Your Dashboard Plan",
  showcase: "Upgrade Your Showcase Plan",
};

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  shop: "Unlock more products, orders, and advanced e-commerce features for your online store",
  marketing:
    "Scale your campaigns with higher limits and advanced automation tools",
  api: "Increase API rate limits and access premium developer features",
  dashboard: "Unlock premium analytics and advanced dashboard capabilities",
  showcase: "Expand your portfolio with more projects and premium templates",
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const domain = headersList.get("x-product-domain") || "dashboard";

  return {
    title: DOMAIN_TITLES[domain] || "Upgrade Your Plan - Flowauxi",
    description:
      DOMAIN_DESCRIPTIONS[domain] ||
      "Unlock more features and higher limits with a premium plan",
    openGraph: {
      title: DOMAIN_TITLES[domain] || "Upgrade Your Plan",
      description: DOMAIN_DESCRIPTIONS[domain],
      type: "website",
    },
  };
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; recommended?: string }>;
}) {
  const headersList = await headers();
  const detectedDomain = headersList.get("x-product-domain") || "dashboard";

  // Await searchParams (Next.js 15 requirement)
  const params = await searchParams;

  // ── Production-grade URL cleanup ──────────────────────────────────────
  // When the middleware header already identifies the domain (e.g. marketing
  // from port 3003), strip the stale ?domain= query param from the URL.
  // This fires a server-side 307 redirect that cleans the browser address
  // bar.  The redirect target has no ?domain= param → no infinite loop.
  if (params.domain && detectedDomain !== "dashboard") {
    const cleanUrl = params.recommended
      ? `/upgrade?recommended=${encodeURIComponent(params.recommended)}`
      : "/upgrade";
    redirect(cleanUrl);
  }

  // Header detection takes precedence — it's set by middleware based on actual hostname/port.
  // Query param is only a fallback for direct navigation without middleware (e.g., tests).
  const domain = detectedDomain !== "dashboard" ? detectedDomain : (params.domain || detectedDomain);
  const recommendedPlan = params.recommended;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 w-full bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src={logo} alt="Flowauxi" width={28} height={28} />
            <span className="text-base font-bold text-gray-900">Flowauxi</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors duration-150"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </nav>

      {/* Header Section */}
      <div className="w-full pt-10 pb-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Choose Your Plan
          </h1>
          <p className="mt-3 text-base text-gray-500 max-w-lg mx-auto">
            {DOMAIN_DESCRIPTIONS[domain] ||
              "Select the perfect plan for your needs"}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-8">
        <UpgradeContainer
          initialDomain={domain}
          recommendedPlan={recommendedPlan}
        />
      </div>

      {/* Footer — Dark variant */}
      <ShopFooter dark />
    </div>
  );
}
