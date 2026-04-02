/**
 * Analytics Event Schema Governance
 * ===================================
 *
 * FAANG-Level Strict Typed Event Definitions.
 *
 * This module is the SINGLE SOURCE OF TRUTH for all analytics events.
 * Every event that flows through the analytics system MUST be defined here.
 *
 * Benefits:
 *   - Compile-time enforcement — no garbage data
 *   - Documented event catalog — any engineer can see what's tracked
 *   - Schema versioning — safe migrations when events evolve
 *   - Shared between client + server (Measurement Protocol)
 *
 * Rules:
 *   - NEVER use `Record<string, any>` for event params
 *   - ALWAYS add new events to the AnalyticsEvent discriminated union
 *   - INCREMENT ANALYTICS_SCHEMA_VERSION when adding/modifying events
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/reference/events
 */

// =============================================================================
// SCHEMA VERSIONING
// =============================================================================

/**
 * Current event schema version.
 * Increment when:
 *   - New events are added
 *   - Event parameter shapes change
 *   - Events are deprecated
 *
 * Format: semver (major.minor.patch)
 *   - MAJOR: breaking param changes
 *   - MINOR: new events added
 *   - PATCH: optional param additions
 */
export const ANALYTICS_SCHEMA_VERSION = "1.0.0";

// =============================================================================
// SHARED TYPES
// =============================================================================

/** GA4 standard ecommerce item */
export interface EcommerceItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_category2?: string;
  item_brand?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  coupon?: string;
  discount?: number;
  index?: number;
}

/** User identity traits */
export interface UserTraits {
  plan?: string;
  domain?: string;
  signup_date?: string;
  is_paying?: boolean;
  [key: string]: string | number | boolean | undefined;
}

// =============================================================================
// EVENT DEFINITIONS — Discriminated Union
// =============================================================================

/**
 * The master analytics event type.
 * ALL analytics events MUST be a member of this union.
 *
 * Usage:
 *   import { AnalyticsEvent } from '@/lib/analytics/events';
 *   const event: AnalyticsEvent = { name: 'purchase', params: { ... } };
 *
 * TypeScript will enforce the correct params shape for each event name.
 */
export type AnalyticsEvent =
  // ── Page Tracking ──────────────────────────────────────────────────
  | {
      name: "page_view";
      params: {
        page_path: string;
        page_title?: string;
        page_location?: string;
        page_referrer?: string;
      };
    }

  // ── Authentication ──────────────────────────────────────────────────
  | {
      name: "login";
      params: {
        method: "email" | "google" | "facebook" | "whatsapp";
      };
    }
  | {
      name: "signup";
      params: {
        method: "email" | "google" | "facebook" | "whatsapp";
        plan?: string;
      };
    }
  | {
      name: "logout";
      params: Record<string, never>;
    }

  // ── Ecommerce / Revenue ──────────────────────────────────────────────
  | {
      name: "purchase";
      params: {
        transaction_id: string;
        value: number;
        currency: string;
        items: EcommerceItem[];
        coupon?: string;
        tax?: number;
        shipping?: number;
      };
    }
  | {
      name: "begin_checkout";
      params: {
        value: number;
        currency: string;
        items: EcommerceItem[];
        coupon?: string;
      };
    }
  | {
      name: "add_to_cart";
      params: {
        value: number;
        currency: string;
        items: EcommerceItem[];
      };
    }
  | {
      name: "remove_from_cart";
      params: {
        value: number;
        currency: string;
        items: EcommerceItem[];
      };
    }
  | {
      name: "view_item";
      params: {
        value?: number;
        currency?: string;
        items: EcommerceItem[];
      };
    }
  | {
      name: "view_item_list";
      params: {
        item_list_id?: string;
        item_list_name?: string;
        items: EcommerceItem[];
      };
    }

  // ── Subscription / Pricing Funnel ────────────────────────────────────
  | {
      name: "pricing_viewed";
      params: {
        domain: string;
        source?: string;
      };
    }
  | {
      name: "pricing_card_clicked";
      params: {
        domain: string;
        plan: string;
        price?: number;
        currency?: string;
      };
    }
  | {
      name: "plan_selected";
      params: {
        domain: string;
        plan: string;
        billing_cycle?: "monthly" | "yearly";
      };
    }
  | {
      name: "payment_initiated";
      params: {
        domain: string;
        plan: string;
        value: number;
        currency: string;
        payment_method?: string;
      };
    }
  | {
      name: "payment_success";
      params: {
        domain: string;
        plan: string;
        transaction_id: string;
        value: number;
        currency: string;
      };
    }
  | {
      name: "payment_failed";
      params: {
        domain: string;
        plan: string;
        error_message?: string;
        error_code?: string;
      };
    }
  | {
      name: "subscription_activated";
      params: {
        domain: string;
        plan: string;
        subscription_id: string;
      };
    }

  // ── WhatsApp ────────────────────────────────────────────────────────
  | {
      name: "whatsapp_connection_started";
      params: {
        domain: string;
      };
    }
  | {
      name: "whatsapp_connected";
      params: {
        domain: string;
        phone_number_id?: string;
      };
    }
  | {
      name: "message_sent";
      params: {
        message_type: "text" | "template" | "media" | "interactive";
        domain: string;
      };
    }
  | {
      name: "broadcast_sent";
      params: {
        domain: string;
        recipient_count: number;
        template_name?: string;
      };
    }

  // ── Engagement ──────────────────────────────────────────────────────
  | {
      name: "contact_form_submit";
      params: {
        form_id?: string;
        source?: string;
      };
    }
  | {
      name: "cta_clicked";
      params: {
        cta_text: string;
        cta_location: string;
        destination?: string;
      };
    }
  | {
      name: "feature_used";
      params: {
        feature_name: string;
        domain: string;
      };
    }
  | {
      name: "onboarding_step_completed";
      params: {
        step_number: number;
        step_name: string;
        domain: string;
      };
    }
  | {
      name: "onboarding_completed";
      params: {
        domain: string;
        total_time_seconds?: number;
      };
    }

  // ── Performance Monitoring ──────────────────────────────────────────
  | {
      name: "timing_complete";
      params: {
        name: string;
        value: number;
        event_category: string;
        event_label?: string;
      };
    }

  // ── Error Tracking ──────────────────────────────────────────────────
  | {
      name: "exception";
      params: {
        description: string;
        fatal: boolean;
      };
    }

  // ── Search ──────────────────────────────────────────────────────────
  | {
      name: "search";
      params: {
        search_term: string;
        results_count?: number;
      };
    }

  // ── Generic Custom Event (escape hatch — use sparingly) ─────────────
  | {
      name: "custom_event";
      params: {
        event_category: string;
        event_label: string;
        value?: number;
        [key: string]: string | number | boolean | undefined;
      };
    };

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/** Extract event names as a union type */
export type AnalyticsEventName = AnalyticsEvent["name"];

/** Extract params type for a specific event name */
export type EventParams<T extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: T }
>["params"];

/**
 * Type guard to validate an event matches the schema.
 * Used by server-side tracking to validate incoming events.
 */
export function isValidEventName(name: string): name is AnalyticsEventName {
  const validNames: AnalyticsEventName[] = [
    "page_view",
    "login",
    "signup",
    "logout",
    "purchase",
    "begin_checkout",
    "add_to_cart",
    "remove_from_cart",
    "view_item",
    "view_item_list",
    "pricing_viewed",
    "pricing_card_clicked",
    "plan_selected",
    "payment_initiated",
    "payment_success",
    "payment_failed",
    "subscription_activated",
    "whatsapp_connection_started",
    "whatsapp_connected",
    "message_sent",
    "broadcast_sent",
    "contact_form_submit",
    "cta_clicked",
    "feature_used",
    "onboarding_step_completed",
    "onboarding_completed",
    "timing_complete",
    "exception",
    "search",
    "custom_event",
  ];
  return validNames.includes(name as AnalyticsEventName);
}

// =============================================================================
// DEPRECATED EVENT MAPPING (for migration)
// =============================================================================

/**
 * Maps old untyped event names to new schema events.
 * Used during migration to ensure backward compatibility.
 *
 * Example: Old code used trackEvent('user_signup', {...})
 *          → Now mapped to { name: 'signup', params: {...} }
 */
export const DEPRECATED_EVENT_MAP: Record<string, AnalyticsEventName> = {
  user_signup: "signup",
  user_login: "login",
  user_logout: "logout",
  form_submit: "contact_form_submit",
  button_click: "cta_clicked",
};
