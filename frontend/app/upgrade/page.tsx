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

import { Metadata } from 'next';
import { headers } from 'next/headers';
import UpgradeContainer from './components/UpgradeContainer';

// Domain-specific metadata
const DOMAIN_TITLES: Record<string, string> = {
  shop: 'Upgrade Your Shop Plan',
  marketing: 'Upgrade Your Marketing Plan',
  api: 'Upgrade Your API Plan',
  dashboard: 'Upgrade Your Dashboard Plan',
  showcase: 'Upgrade Your Showcase Plan',
};

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  shop: 'Unlock more products, orders, and advanced e-commerce features for your online store',
  marketing: 'Scale your campaigns with higher limits and advanced automation tools',
  api: 'Increase API rate limits and access premium developer features',
  dashboard: 'Unlock premium analytics and advanced dashboard capabilities',
  showcase: 'Expand your portfolio with more projects and premium templates',
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const domain = headersList.get('x-product-domain') || 'dashboard';

  return {
    title: DOMAIN_TITLES[domain] || 'Upgrade Your Plan - Flowauxi',
    description: DOMAIN_DESCRIPTIONS[domain] || 'Unlock more features and higher limits with a premium plan',
    openGraph: {
      title: DOMAIN_TITLES[domain] || 'Upgrade Your Plan',
      description: DOMAIN_DESCRIPTIONS[domain],
      type: 'website',
    },
  };
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; recommended?: string }>;
}) {
  const headersList = await headers();
  const detectedDomain = headersList.get('x-product-domain') || 'dashboard';

  // Await searchParams (Next.js 15 requirement)
  const params = await searchParams;

  // Query params take precedence over header detection
  const domain = params.domain || detectedDomain;
  const recommendedPlan = params.recommended;

  return (
    <div className="min-h-screen bg-white">
      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-black sm:text-5xl md:text-6xl">
            Choose Your Plan
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            {DOMAIN_DESCRIPTIONS[domain] || 'Select the perfect plan for your needs'}
          </p>
        </div>

        {/* Upgrade Container (Client Component) */}
        <UpgradeContainer
          initialDomain={domain}
          recommendedPlan={recommendedPlan}
        />
      </div>
    </div>
  );
}
