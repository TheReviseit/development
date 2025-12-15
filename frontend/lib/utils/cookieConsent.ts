/**
 * GDPR-Compliant Cookie Consent Management System
 *
 * Features:
 * - Granular consent by category (necessary, analytics, marketing, preferences)
 * - Delayed script loading (only after consent)
 * - Consent versioning and timestamps
 * - Easy consent updates
 * - Automatic cookie cleanup
 *
 * @see cookieTypes.ts for type definitions
 * @see cookieConfig.ts for configuration
 */

import {
  CookieCategory,
  ConsentPreferences,
  CookieConsentData,
  LegacyConsentStatus,
} from "./cookieTypes";
import {
  CONSENT_VERSION,
  CONSENT_STORAGE_KEY,
  COOKIE_SCRIPTS,
  ESSENTIAL_COOKIE_NAMES,
  COOKIE_PATTERNS_BY_CATEGORY,
} from "./cookieConfig";

// ============================================================================
// CONSENT STORAGE & RETRIEVAL
// ============================================================================

/**
 * Get the current cookie consent data
 * Returns null if no consent has been given
 */
export function getConsentData(): CookieConsentData | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as CookieConsentData;

    // Validate the data structure
    if (!data.preferences || !data.timestamp || !data.version) {
      console.warn("Invalid consent data format, clearing...");
      clearConsent();
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error reading consent data:", error);
    return null;
  }
}

/**
 * Get just the consent preferences (without metadata)
 */
export function getConsentPreferences(): ConsentPreferences | null {
  const data = getConsentData();
  return data?.preferences || null;
}

/**
 * Check if user has given any consent (accepted or rejected)
 */
export function hasConsent(): boolean {
  return getConsentData() !== null;
}

/**
 * Check if a specific cookie category is allowed
 */
export function isCategoryAllowed(category: CookieCategory): boolean {
  const preferences = getConsentPreferences();
  if (!preferences) return false;

  // Necessary cookies are always allowed
  if (category === CookieCategory.NECESSARY) return true;

  return preferences[category] === true;
}

/**
 * Save consent data to localStorage
 */
function saveConsentData(preferences: ConsentPreferences): void {
  if (typeof window === "undefined") return;

  const consentData: CookieConsentData = {
    preferences,
    timestamp: Date.now(),
    version: CONSENT_VERSION,
  };

  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));

  // Dispatch event for listeners
  window.dispatchEvent(
    new CustomEvent("cookieConsentChanged", {
      detail: { preferences, timestamp: consentData.timestamp },
    })
  );
}

/**
 * Clear all consent data (for testing or reset)
 */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CONSENT_STORAGE_KEY);
}

// ============================================================================
// CONSENT MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Accept all cookies (all categories)
 */
export function acceptAllCookies(): void {
  const preferences: ConsentPreferences = {
    necessary: true,
    analytics: true,
    marketing: true,
    preferences: true,
  };

  saveConsentData(preferences);
  loadConsentedScripts();
  console.log("✅ All cookies accepted");
}

/**
 * Reject all non-essential cookies (only necessary cookies allowed)
 */
export function rejectNonEssential(): void {
  const preferences: ConsentPreferences = {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  };

  saveConsentData(preferences);
  cleanupCookiesByConsent(preferences);
  console.log("❌ Non-essential cookies rejected");
}

/**
 * Set custom consent preferences
 * Allows granular control over cookie categories
 */
export function setCustomConsent(
  customPreferences: Partial<ConsentPreferences>
): void {
  const preferences: ConsentPreferences = {
    necessary: true, // Always true
    analytics: customPreferences.analytics ?? false,
    marketing: customPreferences.marketing ?? false,
    preferences: customPreferences.preferences ?? false,
  };

  saveConsentData(preferences);
  loadConsentedScripts();
  cleanupCookiesByConsent(preferences);
  console.log("⚙️ Custom consent saved:", preferences);
}

/**
 * Update existing consent (for settings page)
 * Merges with existing preferences
 */
export function updateConsent(updates: Partial<ConsentPreferences>): void {
  const current = getConsentPreferences();

  if (!current) {
    // No existing consent, treat as new custom consent
    setCustomConsent(updates);
    return;
  }

  const preferences: ConsentPreferences = {
    necessary: true, // Always true
    analytics: updates.analytics ?? current.analytics,
    marketing: updates.marketing ?? current.marketing,
    preferences: updates.preferences ?? current.preferences,
  };

  saveConsentData(preferences);
  loadConsentedScripts();
  cleanupCookiesByConsent(preferences);
  console.log("🔄 Consent updated:", preferences);
}

// ============================================================================
// SCRIPT LOADING (Delayed until consent)
// ============================================================================

/**
 * Load all scripts that the user has consented to
 * This is the key to GDPR compliance - scripts only load AFTER consent
 */
export function loadConsentedScripts(): void {
  if (typeof window === "undefined") return;

  COOKIE_SCRIPTS.forEach((script) => {
    if (!script.enabled) return;

    // Check if user consented to this category
    if (!isCategoryAllowed(script.category)) {
      console.log(
        `⏭️ Skipping ${script.name} - no consent for ${script.category}`
      );
      return;
    }

    // Check if already loaded
    if (document.querySelector(`script[data-cookie-script="${script.id}"]`)) {
      console.log(`ℹ️ ${script.name} already loaded`);
      return;
    }

    // Load external script
    if (script.src) {
      const scriptElement = document.createElement("script");
      scriptElement.src = script.src;
      scriptElement.async = true;
      scriptElement.setAttribute("data-cookie-script", script.id);

      scriptElement.onload = () => {
        // Run initialization after script loads
        if (script.init) {
          script.init();
        }
      };

      document.head.appendChild(scriptElement);
      console.log(`📥 Loading ${script.name}...`);
    }
    // Run inline script
    else if (script.init) {
      script.init();
    }
  });
}

/**
 * Initialize scripts on page load (if consent already exists)
 * Call this in your root layout or _app.tsx
 */
export function initializeConsentedScripts(): void {
  if (!hasConsent()) {
    console.log("ℹ️ No consent yet - scripts will load after user choice");
    return;
  }

  loadConsentedScripts();
}

// ============================================================================
// COOKIE CLEANUP
// ============================================================================

/**
 * Delete cookies based on consent preferences
 * Removes cookies from categories the user has not consented to
 */
function cleanupCookiesByConsent(preferences: ConsentPreferences): void {
  // For each category that's NOT consented
  Object.entries(preferences).forEach(([category, allowed]) => {
    if (!allowed && category !== "necessary") {
      const patterns = COOKIE_PATTERNS_BY_CATEGORY[category as CookieCategory];
      patterns.forEach((pattern) => {
        deleteCookiesByPattern(pattern);
      });
    }
  });
}

/**
 * Delete cookies matching a pattern
 */
function deleteCookiesByPattern(pattern: string): void {
  const cookies = document.cookie.split(";");

  cookies.forEach((cookie) => {
    const cookieName = cookie.split("=")[0].trim();

    // Don't delete essential cookies
    if (
      ESSENTIAL_COOKIE_NAMES.some((essential) => cookieName.includes(essential))
    ) {
      return;
    }

    // Delete if matches pattern
    if (cookieName.includes(pattern)) {
      deleteCookie(cookieName);
      console.log(`🗑️ Deleted cookie: ${cookieName}`);
    }
  });
}

/**
 * Delete a specific cookie
 */
export function deleteCookie(name: string): void {
  // Delete for all possible paths and domains
  const domains = [window.location.hostname, `.${window.location.hostname}`];
  const paths = ["/", window.location.pathname];

  domains.forEach((domain) => {
    paths.forEach((path) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain};`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
    });
  });
}

// ============================================================================
// COOKIE UTILITIES
// ============================================================================

/**
 * Set a cookie (only if user has consented to the category)
 */
export function setCookie(
  name: string,
  value: string,
  category: CookieCategory = CookieCategory.PREFERENCES,
  days: number = 365
): void {
  if (!isCategoryAllowed(category)) {
    console.log(`🚫 Cookie blocked: ${name} (category: ${category})`);
    return;
  }

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);

  document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax; Secure`;
  console.log(`✅ Cookie set: ${name}`);
}

/**
 * Get a cookie value
 */
export function getCookie(name: string): string | null {
  if (typeof window === "undefined") return null;

  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(";");

  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith(nameEQ)) {
      return cookie.substring(nameEQ.length);
    }
  }

  return null;
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Track custom event (only if analytics consent given)
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, any>
): void {
  if (!isCategoryAllowed(CookieCategory.ANALYTICS)) {
    console.log(`📊 Event tracking blocked: ${eventName}`);
    return;
  }

  // Google Analytics
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, eventData);
  }

  // Facebook Pixel
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", eventName, eventData);
  }

  console.log(`📊 Event tracked: ${eventName}`, eventData);
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Migrate from old consent format to new format
 * Handles backward compatibility
 */
export function migrateLegacyConsent(): void {
  if (typeof window === "undefined") return;

  const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
  if (!stored) return;

  // Check if it's the old format (just a string)
  if (stored === "accepted" || stored === "rejected") {
    const legacyStatus = stored as LegacyConsentStatus;

    if (legacyStatus === "accepted") {
      acceptAllCookies();
    } else {
      rejectNonEssential();
    }

    console.log("✅ Migrated legacy consent:", legacyStatus);
  }
}

/**
 * Get legacy consent status (for backward compatibility)
 * @deprecated Use getConsentPreferences() instead
 */
export function getCookieConsent(): LegacyConsentStatus {
  const preferences = getConsentPreferences();

  if (!preferences) return null;

  // If all non-essential are accepted, return 'accepted'
  if (
    preferences.analytics &&
    preferences.marketing &&
    preferences.preferences
  ) {
    return "accepted";
  }

  // If all non-essential are rejected, return 'rejected'
  if (
    !preferences.analytics &&
    !preferences.marketing &&
    !preferences.preferences
  ) {
    return "rejected";
  }

  // Custom preferences - return 'accepted' if any non-essential is true
  return "accepted";
}

/**
 * Set legacy consent status (for backward compatibility)
 * @deprecated Use acceptAllCookies() or rejectNonEssential() instead
 */
export function setCookieConsent(status: "accepted" | "rejected"): void {
  if (status === "accepted") {
    acceptAllCookies();
  } else {
    rejectNonEssential();
  }
}

/**
 * Check if user has accepted cookies (legacy)
 * @deprecated Use isCategoryAllowed() instead
 */
export function hasAcceptedCookies(): boolean {
  return getCookieConsent() === "accepted";
}
