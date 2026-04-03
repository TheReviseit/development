/**
 * Analytics Type Definitions
 * ===========================
 * 
 * FAANG-Level typed definitions for all analytics modules.
 */

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  version: string;
  updatedAt: number;
  source: "cookie" | "banner" | "api";
}

export interface ConsentConfig {
  analytics_storage: "granted" | "denied";
  ad_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
  functionality_storage: "granted" | "denied";
  personalization_storage: "granted" | "denied";
  security_storage: "granted" | "denied";
}

/**
 * Consent status enum for type safety
 */
export enum ConsentStatus {
  GRANTED = "granted",
  DENIED = "denied",
}

/**
 * Consent category enum
 */
export enum ConsentCategory {
  ANALYTICS = "analytics",
  MARKETING = "marketing",
  PREFERENCES = "preferences",
}