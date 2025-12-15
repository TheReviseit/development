"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  acceptAllCookies,
  rejectNonEssential,
  setCustomConsent,
  hasConsent,
  getConsentPreferences,
  migrateLegacyConsent,
} from "@/lib/utils/cookieConsent";
import { ConsentPreferences } from "@/lib/utils/cookieTypes";
import "./CookieConsent.css";

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [customPreferences, setCustomPreferences] =
    useState<ConsentPreferences>({
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    });

  useEffect(() => {
    // Migrate legacy consent format if exists
    migrateLegacyConsent();

    // Check if user has already made a choice
    if (!hasConsent()) {
      // Show banner after a short delay for better UX
      setTimeout(() => setShowBanner(true), 1000);
    }
  }, []);

  const handleAcceptAll = () => {
    acceptAllCookies();
    setShowBanner(false);
    setShowCustomize(false);
  };

  const handleRejectAll = () => {
    rejectNonEssential();
    setShowBanner(false);
    setShowCustomize(false);
  };

  const handleCustomize = () => {
    setShowCustomize(true);
    // Load current preferences if they exist
    const current = getConsentPreferences();
    if (current) {
      setCustomPreferences(current);
    }
  };

  const handleSaveCustom = () => {
    setCustomConsent(customPreferences);
    setShowBanner(false);
    setShowCustomize(false);
  };

  const handleBackToMain = () => {
    setShowCustomize(false);
  };

  const togglePreference = (category: keyof ConsentPreferences) => {
    if (category === "necessary") return; // Can't toggle necessary cookies

    setCustomPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  if (!showBanner) return null;

  return (
    <div className="cookie-backdrop" onClick={handleRejectAll}>
      <div className="cookie-card" onClick={(e) => e.stopPropagation()}>
        <button
          className="cookie-close"
          onClick={handleRejectAll}
          aria-label="Close and reject cookies"
        >
          ✕
        </button>

        {!showCustomize ? (
          // Main Banner View
          <>
            <div className="cookie-header">
              <div className="cookie-emoji">🍪</div>
              <h2>Cookie Settings</h2>
            </div>

            <p className="cookie-description">
              We use cookies to enhance your experience. You can accept all,
              reject non-essential, or customize your preferences.
            </p>

            <div className="cookie-footer">
              <Link href="/privacy" className="cookie-privacy-link">
                Privacy Policy
              </Link>
              <div className="cookie-buttons">
                <button
                  onClick={handleRejectAll}
                  className="cookie-btn cookie-btn-secondary"
                >
                  Reject All
                </button>
                <button
                  onClick={handleCustomize}
                  className="cookie-btn cookie-btn-tertiary"
                >
                  Customize
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="cookie-btn cookie-btn-primary"
                >
                  Accept All
                </button>
              </div>
            </div>
          </>
        ) : (
          // Customization View
          <>
            <div className="cookie-header">
              <button
                className="cookie-back-btn"
                onClick={handleBackToMain}
                aria-label="Back to main view"
              >
                ←
              </button>
              <h2>Customize Cookie Preferences</h2>
            </div>

            <p className="cookie-description">
              Choose which types of cookies you want to allow. You can change
              these settings at any time.
            </p>

            <div className="cookie-customize-list">
              {/* Necessary Cookies */}
              <div className="cookie-customize-item">
                <div className="cookie-customize-header">
                  <div>
                    <span className="cookie-badge essential">Essential</span>
                    <h3 className="cookie-customize-title">
                      Necessary Cookies
                    </h3>
                  </div>
                  <label className="cookie-toggle">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      aria-label="Necessary cookies (always active)"
                    />
                    <span className="cookie-toggle-slider disabled"></span>
                  </label>
                </div>
                <p className="cookie-customize-description">
                  These cookies are essential for the website to function and
                  cannot be disabled.
                </p>
              </div>

              {/* Analytics Cookies */}
              <div className="cookie-customize-item">
                <div className="cookie-customize-header">
                  <div>
                    <span className="cookie-badge analytics">Analytics</span>
                    <h3 className="cookie-customize-title">
                      Analytics Cookies
                    </h3>
                  </div>
                  <label className="cookie-toggle">
                    <input
                      type="checkbox"
                      checked={customPreferences.analytics}
                      onChange={() => togglePreference("analytics")}
                      aria-label="Toggle analytics cookies"
                    />
                    <span className="cookie-toggle-slider"></span>
                  </label>
                </div>
                <p className="cookie-customize-description">
                  Help us understand how visitors interact with our website by
                  collecting and reporting information anonymously.
                </p>
              </div>

              {/* Marketing Cookies */}
              <div className="cookie-customize-item">
                <div className="cookie-customize-header">
                  <div>
                    <span className="cookie-badge marketing">Marketing</span>
                    <h3 className="cookie-customize-title">
                      Marketing Cookies
                    </h3>
                  </div>
                  <label className="cookie-toggle">
                    <input
                      type="checkbox"
                      checked={customPreferences.marketing}
                      onChange={() => togglePreference("marketing")}
                      aria-label="Toggle marketing cookies"
                    />
                    <span className="cookie-toggle-slider"></span>
                  </label>
                </div>
                <p className="cookie-customize-description">
                  Used to track visitors across websites to display relevant ads
                  and measure campaign effectiveness.
                </p>
              </div>

              {/* Preference Cookies */}
              <div className="cookie-customize-item">
                <div className="cookie-customize-header">
                  <div>
                    <span className="cookie-badge preferences">
                      Preferences
                    </span>
                    <h3 className="cookie-customize-title">
                      Preference Cookies
                    </h3>
                  </div>
                  <label className="cookie-toggle">
                    <input
                      type="checkbox"
                      checked={customPreferences.preferences}
                      onChange={() => togglePreference("preferences")}
                      aria-label="Toggle preference cookies"
                    />
                    <span className="cookie-toggle-slider"></span>
                  </label>
                </div>
                <p className="cookie-customize-description">
                  Remember your settings and preferences like language, theme,
                  and region.
                </p>
              </div>
            </div>

            <div className="cookie-footer">
              <Link href="/privacy" className="cookie-privacy-link">
                Privacy Policy
              </Link>
              <div className="cookie-buttons">
                <button
                  onClick={handleRejectAll}
                  className="cookie-btn cookie-btn-secondary"
                >
                  Reject All
                </button>
                <button
                  onClick={handleSaveCustom}
                  className="cookie-btn cookie-btn-primary"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
