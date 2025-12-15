/**
 * TypeScript Type Definitions for Cookie Consent System
 * Provides type safety for GDPR-compliant cookie management
 */

/**
 * Available cookie categories following GDPR classification
 */
export enum CookieCategory {
  NECESSARY = "necessary",
  ANALYTICS = "analytics",
  MARKETING = "marketing",
  PREFERENCES = "preferences",
}

/**
 * User's consent preferences for each cookie category
 */
export interface ConsentPreferences {
  necessary: boolean; // Always true - required for site functionality
  analytics: boolean; // Google Analytics, tracking, etc.
  marketing: boolean; // Advertising, retargeting, social media pixels
  preferences: boolean; // User preferences, language, theme, etc.
}

/**
 * Complete consent record with metadata for GDPR compliance
 */
export interface CookieConsentData {
  preferences: ConsentPreferences;
  timestamp: number; // When consent was given (Unix timestamp)
  version: string; // Consent version for tracking policy changes
}

/**
 * Configuration for third-party scripts that require consent
 */
export interface CookieScript {
  id: string; // Unique identifier (e.g., 'google-analytics')
  name: string; // Display name (e.g., 'Google Analytics')
  category: CookieCategory; // Which category this script belongs to
  src?: string; // Script URL (if external script)
  init?: () => void; // Initialization function (if inline script)
  enabled: boolean; // Whether this script is enabled in config
}

/**
 * Metadata about individual cookies for transparency
 */
export interface CookieMetadata {
  name: string; // Cookie name
  category: CookieCategory; // Cookie category
  purpose: string; // What this cookie does
  duration: string; // How long it persists (e.g., '1 year', 'session')
  provider: string; // Who sets this cookie (e.g., 'First-party', 'Google')
}

/**
 * Legacy consent status for backward compatibility
 */
export type LegacyConsentStatus = "accepted" | "rejected" | null;
