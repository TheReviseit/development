"use client";

import React from "react";
import Link from "next/link";

interface UpgradeBannerProps {
  message?: string;
  ctaText?: string;
  ctaHref?: string;
}

export default function UpgradeBanner({
  message = "Complete billing to activate live APIs",
  ctaText = "Upgrade Now",
  ctaHref = "/console/billing/select-plan",
}: UpgradeBannerProps) {
  return (
    <div className="upgrade-banner">
      <div className="upgrade-banner-content">
        <div className="upgrade-banner-icon">🚀</div>
        <div className="upgrade-banner-text">
          <h4>Sandbox Mode Active</h4>
          <p>{message}</p>
        </div>
      </div>
      <Link href={ctaHref} className="upgrade-banner-btn">
        {ctaText}
      </Link>
    </div>
  );
}
