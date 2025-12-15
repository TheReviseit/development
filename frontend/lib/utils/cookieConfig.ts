/**
 * Cookie Configuration System
 * Centralized configuration for all cookies and third-party scripts
 * Makes the system maintainable and easy to update
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
  {
    id: "google-analytics",
    name: "Google Analytics",
    category: CookieCategory.ANALYTICS,
    src: `https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`,
    enabled: !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    init: () => {
      // Initialize Google Analytics
      window.dataLayer = window.dataLayer || [];
      window.gtag = function (...args: any[]) {
        window.dataLayer.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!, {
        anonymize_ip: true, // GDPR compliance
        cookie_flags: "SameSite=None;Secure",
      });
      console.log("✅ Google Analytics initialized");
    },
  },
  {
    id: "facebook-pixel",
    name: "Facebook Pixel",
    category: CookieCategory.MARKETING,
    src: "https://connect.facebook.net/en_US/fbevents.js",
    enabled: !!process.env.NEXT_PUBLIC_FB_PIXEL_ID,
    init: () => {
      // Initialize Facebook Pixel
      !(function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
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
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}
