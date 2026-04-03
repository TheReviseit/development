"use client";

/**
 * GtagScript - FAANG-Level Google Analytics Loader
 * =================================================
 *
 * CRITICAL: This component uses strategy="beforeInteractive" to ensure
 * consent is restored BEFORE gtag.js loads. This prevents the race condition
 * where gtag initializes before consent is applied.
 *
 * The consent restoration runs as pure inline JavaScript (not React useEffect),
 * which is required for beforeInteractive to work correctly.
 *
 * Architecture:
 *   1. Inline JS reads localStorage for persisted consent
 *   2. Applies consent via gtag("consent", "default", {...}) BEFORE gtag loads
 *   3. Loads gtag.js from Google CDN
 *   4. Initializes with config (send_page_view:false for Next.js SPA)
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/scripts
 */

import Script from "next/script";

const MEASUREMENT_ID = "G-F02P5002S8";

const CONSENT_RESTORE_SCRIPT = `
(function() {
  'use strict';
  
  try {
    // Read persisted consent from localStorage
    var consentData = localStorage.getItem('fa_consent');
    
    if (consentData) {
      var consent = JSON.parse(consentData);
      
      // Store for later use by AnalyticsProvider
      window.__fa_consent_restored = {
        analytics: consent.analytics,
        marketing: consent.marketing,
        preferences: consent.preferences
      };
      
      // Check if gtag is available yet (it might not be)
      if (typeof window.gtag === 'function') {
        // Apply consent BEFORE any config fires
        window.gtag('consent', 'default', {
          analytics_storage: consent.analytics ? 'granted' : 'denied',
          ad_storage: consent.marketing ? 'granted' : 'denied',
          ad_user_data: consent.marketing ? 'granted' : 'denied',
          ad_personalization: consent.marketing ? 'granted' : 'denied',
          functionality_storage: 'granted',
          personalization_storage: consent.preferences ? 'granted' : 'denied',
          security_storage: 'granted'
        });
        
        // Update to the restored consent state
        window.gtag('consent', 'update', {
          analytics_storage: consent.analytics ? 'granted' : 'denied',
          ad_storage: consent.marketing ? 'granted' : 'denied'
        });
        
        console.log('[Analytics] Consent restored from localStorage');
      } else {
        // Store for gtag.ts to use after load
        window.__fa_pending_consent = consent;
      }
    }
  } catch (e) {
    console.warn('[Analytics] Failed to restore consent:', e);
  }
})();
`;

const GTAG_INIT_SCRIPT = `
(function() {
  'use strict';
  
  // Initialize dataLayer if not exists
  window.dataLayer = window.dataLayer || [];
  
  // Define gtag function
  window.gtag = function() {
    window.dataLayer.push(arguments);
  };
  
  // Set timestamp
  window.gtag('js', new Date());
  
  // Get pending consent if any
  var pendingConsent = window.__fa_pending_consent;
  
  // Configure with cross-domain settings
  window.gtag('config', '${MEASUREMENT_ID}', {
    // Cross-domain tracking
    linker: {
      domains: [
        'flowauxi.com',
        'shop.flowauxi.com',
        'marketing.flowauxi.com',
        'pages.flowauxi.com',
        'api.flowauxi.com',
        'booking.flowauxi.com'
      ],
      accept_incoming: true,
      decorate_forms: true,
      url_passthrough: true
    },
    // Privacy settings
    anonymize_ip: true,
    cookie_flags: 'SameSite=None;Secure',
    cookie_domain: 'flowauxi.com',
    // DO NOT send page_view - Next.js handles SPA navigation
    send_page_view: false,
    // Consent Mode v2: redact ads data
    ads_data_redaction: true,
    // Apply any pending consent
    analytics_storage: pendingConsent ? (pendingConsent.analytics ? 'granted' : 'denied') : 'denied',
    ad_storage: pendingConsent ? (pendingConsent.marketing ? 'granted' : 'denied') : 'denied'
  });
  
  console.log('[Analytics] gtag initialized');
})();
`;

/**
 * GtagScript component
 * 
 * Mount in root layout BEFORE AnalyticsProvider:
 * 
 * <body>
 *   <GtagScript />
 *   <AnalyticsProvider />
 *   {children}
 * </body>
 */
export function GtagScript() {
  return (
    <>
      {/* 1. Restore consent from localStorage - runs BEFORE gtag loads */}
      <script
        dangerouslySetInnerHTML={{ __html: CONSENT_RESTORE_SCRIPT }}
      />
      
      {/* 2. Load gtag.js - non-blocking, after consent restoration */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="beforeInteractive"
        id="gtag-script"
      />
      
      {/* 3. Initialize gtag - runs after script loads */}
      <Script
        dangerouslySetInnerHTML={{ __html: GTAG_INIT_SCRIPT }}
        id="gtag-init"
      />
    </>
  );
}

export default GtagScript;
