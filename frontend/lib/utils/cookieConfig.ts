/**
 * Cookie Configuration System
 * Centralized configuration for all cookies and third-party scripts
 * Makes the system maintainable and easy to update
 *
 * NOTE: Google Analytics is now managed by lib/analytics/ module.
 * GA script injection, initialization, and cross-domain tracking
 * are handled centrally via the AnalyticsProvider component.
 * Only Facebook Pixel and other third-party scripts are configured here.
 */

import { CookieCategory, CookieScript, CookieMetadata } from "./cookieTypes";

/**
 * Current consent policy version
 * Increment this when privacy policy changes to re-prompt users
 */
export const CONSENT_VERSION = "1.0.0";

/**
 * Consent storage key in localStorage
 */
export const CONSENT_STORAGE_KEY = "cookieConsent";

/**
 * How long before showing the banner again (in days)
 * Set to null to never auto-expire
 */
export const CONSENT_EXPIRY_DAYS = 365;

/**
 * Third-party scripts configuration
 * Add/remove scripts here to manage what loads with consent
 */
export const COOKIE_SCRIPTS: CookieScript[] = [
  // ──────────────────────────────────────────────────────────────────
  // Google Analytics is NOW managed by lib/analytics/ module.
  // It is initialized by the <AnalyticsProvider /> component in
  // app/layout.tsx, which handles:
  //   - Domain-specific Measurement IDs
  //   - Cross-domain tracking
  //   - Data Layer standardization
  //   - Health monitoring
  //   - Server-side tracking
  // DO NOT add GA config here — use lib/analytics/config.ts instead.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "facebook-pixel",
    name: "Facebook Pixel",
    category: CookieCategory.MARKETING,
    src: "https://connect.facebook.net/en_US/fbevents.js",
    enabled: !!process.env.NEXT_PUBLIC_FB_PIXEL_ID,
    init: () => {
      // Initialize Facebook Pixel
      (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod
            ? n.callMethod.apply(n, arguments)
            : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
      })(
        window,
        document,
        "script",
        "https://connect.facebook.net/en_US/fbevents.js"
      );

      window.fbq("init", process.env.NEXT_PUBLIC_FB_PIXEL_ID!);
      window.fbq("track", "PageView");
      console.log("✅ Facebook Pixel initialized");
    },
  },
  // Add more scripts here as needed
  // {
  //   id: 'hotjar',
  //   name: 'Hotjar',
  //   category: CookieCategory.ANALYTICS,
  //   enabled: !!process.env.NEXT_PUBLIC_HOTJAR_ID,
  //   init: () => { /* Hotjar init code */ },
  // },
];

/**
 * Cookie metadata for transparency
 * Displayed in the cookie consent UI
 */
export const COOKIE_METADATA: CookieMetadata[] = [
  {
    name: "cookieConsent",
    category: CookieCategory.NECESSARY,
    purpose: "Stores your cookie consent preferences",
    duration: "1 year",
    provider: "First-party",
  },
  {
    name: "_ga, _gid, _gat",
    category: CookieCategory.ANALYTICS,
    purpose:
      "Used by Google Analytics to track website usage and visitor behavior",
    duration: "2 years (_ga), 24 hours (_gid), 1 minute (_gat)",
    provider: "Google",
  },
  {
    name: "_fbp, _fbc",
    category: CookieCategory.MARKETING,
    purpose: "Used by Facebook to deliver advertising and track conversions",
    duration: "3 months",
    provider: "Facebook",
  },
  {
    name: "theme, language",
    category: CookieCategory.PREFERENCES,
    purpose: "Remembers your site preferences like theme and language",
    duration: "1 year",
    provider: "First-party",
  },
];

/**
 * Essential cookies that should never be deleted
 * These are necessary for the website to function
 */
export const ESSENTIAL_COOKIE_NAMES = [
  "cookieConsent",
  "session",
  "auth",
  "csrf",
  "next-auth",
  "__Secure-next-auth",
  "__Host-next-auth",
];

/**
 * Cookie name patterns to delete by category
 * Used for cleanup when consent is withdrawn
 */
export const COOKIE_PATTERNS_BY_CATEGORY: Record<CookieCategory, string[]> = {
  [CookieCategory.NECESSARY]: [], // Never delete necessary cookies
  [CookieCategory.ANALYTICS]: ["_ga", "_gid", "_gat", "_gac"],
  [CookieCategory.MARKETING]: ["_fbp", "_fbc", "fr", "tr"],
  [CookieCategory.PREFERENCES]: ["theme", "language", "locale"],
};

// TypeScript declarations for third-party scripts
// NOTE: dataLayer and gtag types are now declared in lib/analytics/
declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}
