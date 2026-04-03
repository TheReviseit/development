/**
 * Analytics Consent State Machine Tests
 * ======================================
 *
 * FAANG-level tests for consent state transitions.
 * Tests the three-state circuit breaker behavior.
 */

import { 
  initializeConsentMode,
  grantFullConsent,
  revokeConsent,
  grantAnalyticsOnly,
  updateConsent,
  getConsentState,
  isAnalyticsAllowed,
  isMarketingAllowed,
  ConsentStatus
} from "@/lib/analytics/consent";

// Mock window and localStorage
const mockGtag = jest.fn();
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};

declare global {
  interface Window {
    gtag: typeof mockGtag;
  }
}

describe("Consent Mode v2 State Machine", () => {
  beforeEach(() => {
    // Reset modules to clear state
    jest.resetModules();
    
    // Setup mocks
    global.window = global.window || {};
    global.window.gtag = mockGtag;
    global.localStorage = mockLocalStorage as any;
    
    mockGtag.mockClear();
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockClear();
  });

  describe("Default State (Cookieless Mode)", () => {
    it("should initialize with denied consent by default", () => {
      initializeConsentMode();
      
      const state = getConsentState();
      expect(state.analytics_storage).toBe(ConsentStatus.DENIED);
      expect(state.ad_storage).toBe(ConsentStatus.DENIED);
    });

    it("should not allow analytics without consent", () => {
      initializeConsentMode();
      
      expect(isAnalyticsAllowed()).toBe(false);
    });

    it("should not allow marketing without consent", () => {
      initializeConsentMode();
      
      expect(isMarketingAllowed()).toBe(false);
    });
  });

  describe("Grant Full Consent", () => {
    it("should grant all consent when accept all", () => {
      initializeConsentMode();
      grantFullConsent();
      
      const state = getConsentState();
      expect(state.analytics_storage).toBe(ConsentStatus.GRANTED);
      expect(state.ad_storage).toBe(ConsentStatus.GRANTED);
      expect(state.ad_user_data).toBe(ConsentStatus.GRANTED);
      expect(state.ad_personalization).toBe(ConsentStatus.GRANTED);
    });

    it("should allow analytics after full consent", () => {
      initializeConsentMode();
      grantFullConsent();
      
      expect(isAnalyticsAllowed()).toBe(true);
    });

    it("should allow marketing after full consent", () => {
      initializeConsentMode();
      grantFullConsent();
      
      expect(isMarketingAllowed()).toBe(true);
    });

    it("should persist consent to localStorage", () => {
      initializeConsentMode();
      grantFullConsent();
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "fa_consent",
        expect.any(String)
      );
    });
  });

  describe("Grant Analytics Only", () => {
    it("should grant analytics but deny marketing", () => {
      initializeConsentMode();
      grantAnalyticsOnly();
      
      const state = getConsentState();
      expect(state.analytics_storage).toBe(ConsentStatus.GRANTED);
      expect(state.ad_storage).toBe(ConsentStatus.DENIED);
    });

    it("should allow analytics", () => {
      initializeConsentMode();
      grantAnalyticsOnly();
      
      expect(isAnalyticsAllowed()).toBe(true);
    });

    it("should deny marketing", () => {
      initializeConsentMode();
      grantAnalyticsOnly();
      
      expect(isMarketingAllowed()).toBe(false);
    });
  });

  describe("Revoke Consent", () => {
    it("should revoke all consent when reject", () => {
      initializeConsentMode();
      grantFullConsent();
      revokeConsent();
      
      const state = getConsentState();
      expect(state.analytics_storage).toBe(ConsentStatus.DENIED);
      expect(state.ad_storage).toBe(ConsentStatus.DENIED);
    });

    it("should not allow analytics after revoke", () => {
      initializeConsentMode();
      grantFullConsent();
      revokeConsent();
      
      expect(isAnalyticsAllowed()).toBe(false);
    });

    it("should update gtag consent state", () => {
      initializeConsentMode();
      grantFullConsent();
      revokeConsent();
      
      expect(mockGtag).toHaveBeenCalledWith(
        "consent",
        "update",
        expect.objectContaining({
          analytics_storage: "denied",
          ad_storage: "denied",
        })
      );
    });
  });

  describe("Update Consent", () => {
    it("should update analytics consent", () => {
      initializeConsentMode();
      updateConsent("analytics", true);
      
      const state = getConsentState();
      expect(state.analytics_storage).toBe(ConsentStatus.GRANTED);
    });

    it("should update marketing consent and related fields", () => {
      initializeConsentMode();
      updateConsent("marketing", true);
      
      const state = getConsentState();
      expect(state.ad_storage).toBe(ConsentStatus.GRANTED);
      expect(state.ad_user_data).toBe(ConsentStatus.GRANTED);
      expect(state.ad_personalization).toBe(ConsentStatus.GRANTED);
    });

    it("should update preferences consent", () => {
      initializeConsentMode();
      updateConsent("preferences", true);
      
      const state = getConsentState();
      expect(state.personalization_storage).toBe(ConsentStatus.GRANTED);
    });
  });

  describe("Consent Mode v2 Fields", () => {
    it("should include all v2 fields in default state", () => {
      initializeConsentMode();
      
      const state = getConsentState();
      
      // Required Consent Mode v2 fields
      expect(state).toHaveProperty("analytics_storage");
      expect(state).toHaveProperty("ad_storage");
      expect(state).toHaveProperty("ad_user_data");
      expect(state).toHaveProperty("ad_personalization");
      expect(state).toHaveProperty("functionality_storage");
      expect(state).toHaveProperty("personalization_storage");
      expect(state).toHaveProperty("security_storage");
    });

    it("should always grant functionality and security storage", () => {
      initializeConsentMode();
      
      const state = getConsentState();
      expect(state.functionality_storage).toBe(ConsentStatus.GRANTED);
      expect(state.security_storage).toBe(ConsentStatus.GRANTED);
    });
  });
});

describe("Consent Persistence", () => {
  beforeEach(() => {
    jest.resetModules();
    global.window = global.window || {};
    global.window.gtag = mockGtag;
    global.localStorage = mockLocalStorage as any;
    mockGtag.mockClear();
  });

  it("should restore consent from localStorage", () => {
    const storedConsent = {
      analytics: true,
      marketing: false,
      preferences: true,
      version: "v2",
      updatedAt: Date.now(),
      source: "banner",
    };
    
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedConsent));
    
    initializeConsentMode();
    
    expect(mockGtag).toHaveBeenCalledWith(
      "consent",
      "default",
      expect.objectContaining({
        analytics_storage: "granted",
        ad_storage: "denied",
      })
    );
  });

  it("should handle invalid localStorage gracefully", () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error("Storage error");
    });
    
    // Should not throw
    expect(() => initializeConsentMode()).not.toThrow();
  });
});
