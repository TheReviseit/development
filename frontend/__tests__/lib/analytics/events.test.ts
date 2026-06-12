/**
 * Analytics Event Schema Validation Tests
 * ==========================================
 *
 * FAANG-level tests for event validation.
 * Ensures no garbage data reaches GA4.
 */

import { validateEvent } from "@/lib/analytics/validation";
import {
  isValidEventName,
  ANALYTICS_SCHEMA_VERSION,
} from "@/lib/analytics/events";

// Mock isDebugMode
jest.mock("@/lib/analytics/config", () => ({
  isDebugMode: jest.fn().mockReturnValue(false),
}));

describe("Event Schema Validation", () => {
  function setNodeEnv(value: string | undefined) {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  }

  describe("isValidEventName", () => {
    it("should accept valid GA4 events", () => {
      expect(isValidEventName("page_view")).toBe(true);
      expect(isValidEventName("purchase")).toBe(true);
      expect(isValidEventName("login")).toBe(true);
      expect(isValidEventName("signup")).toBe(true);
      expect(isValidEventName("add_to_cart")).toBe(true);
      expect(isValidEventName("pricing_mode_changed")).toBe(true);
      expect(isValidEventName("trial_started")).toBe(true);
      expect(isValidEventName("trial_start_failed")).toBe(true);
    });

    it("should accept custom events", () => {
      expect(isValidEventName("custom_event")).toBe(true);
    });

    it("should reject invalid event names", () => {
      expect(isValidEventName("")).toBe(false);
      expect(isValidEventName("invalid")).toBe(false);
      expect(isValidEventName("some_random_event")).toBe(false);
    });
  });

  describe("validateEvent", () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      setNodeEnv(originalEnv);
    });

    it("should pass valid page_view event in development", () => {
      setNodeEnv("development");

      const event = {
        name: "page_view",
        params: {
          page_path: "/home",
          page_title: "Dashboard",
        },
      };

      // Should not throw
      expect(() => validateEvent(event as any)).not.toThrow();
    });

    it("should pass valid purchase event in development", () => {
      setNodeEnv("development");

      const event = {
        name: "purchase",
        params: {
          transaction_id: "TXN123",
          value: 29.99,
          currency: "INR",
          items: [{ item_id: "pro", item_name: "Pro Plan" }],
        },
      };

      expect(() => validateEvent(event as any)).not.toThrow();
    });

    it("should throw on invalid event name in development", () => {
      setNodeEnv("development");

      const event = {
        name: "invalid_event_name",
        params: {},
      };

      expect(() => validateEvent(event as any)).toThrow();
    });

    it("should throw on missing purchase required params", () => {
      setNodeEnv("development");

      const event = {
        name: "purchase",
        params: {
          // Missing required params
        },
      };

      expect(() => validateEvent(event as any)).toThrow();
    });

    it("should validate begin_checkout required params", () => {
      setNodeEnv("development");

      const event = {
        name: "begin_checkout",
        params: {
          value: 29.99,
          currency: "INR",
          items: [],
        },
      };

      expect(() => validateEvent(event as any)).not.toThrow();
    });

    it("should pass onboarding pricing toggle events", () => {
      setNodeEnv("development");

      expect(() =>
        validateEvent({
          name: "pricing_mode_changed",
          params: {
            domain: "shop",
            from_mode: "paid",
            to_mode: "trial",
            source: "onboarding_embedded",
          },
        }),
      ).not.toThrow();

      expect(() =>
        validateEvent({
          name: "trial_started",
          params: {
            domain: "shop",
            plan: "starter",
            pricing_mode: "trial",
          },
        }),
      ).not.toThrow();

      expect(() =>
        validateEvent({
          name: "trial_start_failed",
          params: {
            domain: "shop",
            plan: "starter",
            pricing_mode: "trial",
            error_code: "INTERNAL_ERROR",
          },
        }),
      ).not.toThrow();
    });

    it("should throw on missing begin_checkout params", () => {
      setNodeEnv("development");

      const event = {
        name: "begin_checkout",
        params: {},
      };

      expect(() => validateEvent(event as any)).toThrow();
    });

    it("should validate login/signup method param", () => {
      setNodeEnv("development");

      const event = {
        name: "login",
        params: {
          method: "email",
        },
      };

      expect(() => validateEvent(event as any)).not.toThrow();
    });

    it("should throw on missing login method", () => {
      setNodeEnv("development");

      const event = {
        name: "login",
        params: {},
      };

      expect(() => validateEvent(event as any)).toThrow();
    });

    it("should NOT validate in production (silent pass)", () => {
      setNodeEnv("production");

      const event = {
        name: "invalid_event",
        params: {},
      };

      // Should not throw in production
      expect(() => validateEvent(event as any)).not.toThrow();
    });
  });

  describe("Schema Version", () => {
    it("should have a valid schema version", () => {
      expect(ANALYTICS_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should have non-empty schema version", () => {
      expect(ANALYTICS_SCHEMA_VERSION.length).toBeGreaterThan(0);
    });
  });
});
