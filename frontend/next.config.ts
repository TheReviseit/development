import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Security and SEO Headers
  async headers() {
    return [
      // Immutable caching for Next.js static assets (hashed filenames)
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // PWA-specific cache headers for service worker
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
      // PWA manifest headers
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
      // General security headers for all pages EXCEPT auth pages
      // Auth pages need special COOP handling for Firebase Auth popup compatibility
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // 
          // CRITICAL: COOP Header for OAuth Compatibility
          // =============================================
          // 
          // "same-origin-allow-popups" is REQUIRED for Firebase Auth popups to work.
          // 
          // Why not "same-origin"?
          //   - "same-origin" completely isolates the document from cross-origin popups,
          //     breaking Firebase Auth's ability to communicate with the Google OAuth popup.
          //   - This causes the "auth/popup-closed-by-user" error even when the user 
          //     didn't close the popup.
          //
          // Why not "unsafe-none" globally?
          //   - "unsafe-none" disables all cross-origin opener protection, which is a 
          //     security risk for non-auth pages.
          //   - We keep "unsafe-none" ONLY on auth pages (/login, /signup, etc.) for 
          //     maximum compatibility with OAuth providers.
          //
          // "same-origin-allow-popups" strikes the perfect balance:
          //   - Allows same-origin documents to access the opener
          //   - Allows popups to access their opener (needed for OAuth)
          //   - Blocks cross-origin documents from accessing the opener
          //
          // References:
          //   - https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy
          //   - https://firebase.google.com/docs/auth/web/google-signin
          //
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          // 
          // CRITICAL: COEP Header - DO NOT SET TO "require-corp"
          // =====================================================
          // 
          // "require-corp" breaks Firebase Auth and other third-party integrations.
          // If you need COEP for other reasons, use "credentialless" instead.
          // 
          // We intentionally do NOT set COEP here to avoid breaking OAuth flows.
          //
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://vercel.live https://apis.google.com https://accounts.google.com https://www.gstatic.com https://connect.facebook.net https://va.vercel-scripts.com https://checkout.razorpay.com https://*.razorpay.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 https://revsieit.onrender.com https://*.onrender.com https://*.supabase.co https://*.firebase.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://accounts.google.com https://*.firebaseapp.com wss://*.supabase.co https://connect.facebook.net https://graph.facebook.com https://*.facebook.com https://fonts.googleapis.com https://fonts.gstatic.com https://va.vercel-scripts.com https://api.web3forms.com https://api.razorpay.com https://*.razorpay.com https://lumberjack.razorpay.com https://*.r2.dev https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://apis.google.com https://*.googleapis.com",
              "frame-src 'self' https://vercel.live https://accounts.google.com https://*.firebaseapp.com https://www.facebook.com https://web.facebook.com https://api.razorpay.com https://*.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      // Auth pages: Relaxed COOP for maximum Firebase Auth popup compatibility
      // Firebase Auth signInWithPopup requires "unsafe-none" to access window.closed
      // These pages have the highest priority and will override the global headers
      {
        source: "/login",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: "/signup",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: "/verify-email",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: "/reset-password",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: "/forgot-password",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      // Console auth pages
      {
        source: "/console/login",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
      {
        source: "/console/signup",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none",
          },
        ],
      },
    ];
  },

  // SEO Redirects - Permanent 301 for authority transfer
  async redirects() {
    return [
      {
        source: "/whatsapp-automation-ecommerce",
        destination: "https://shop.flowauxi.com",
        permanent: true, // 301 - tells Google this is a permanent move
      },
      // FIXED: Removed duplicate redirect from middleware
      // The non-www -> www redirect is now handled ONLY in proxy.ts
    ];
  },

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },

  // Compression
  compress: true,

  // API Proxy - Forward unmatched /api/* requests to Flask backend
  // Uses fallback form so Next.js App Router API routes always take priority.
  // Only requests that have NO matching Next.js route file are sent to Flask.
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },

  // Explicitly set Turbopack root to resolve workspace inference issues and fix HMR
  turbopack: {
    root: __dirname,
    resolveAlias: {
      tailwindcss: require.resolve("tailwindcss"),
    },
  },
};

export default nextConfig;
