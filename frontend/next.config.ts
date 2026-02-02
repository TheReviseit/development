import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Security and SEO Headers
  async headers() {
    return [
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
      // General security headers
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
            value: "origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com https://vercel.live https://apis.google.com https://accounts.google.com https://www.gstatic.com https://connect.facebook.net https://va.vercel-scripts.com https://checkout.razorpay.com https://*.razorpay.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' http://localhost:5000 http://127.0.0.1:5000 https://revsieit.onrender.com https://*.onrender.com https://*.supabase.co https://*.firebase.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://accounts.google.com https://*.firebaseapp.com wss://*.supabase.co https://connect.facebook.net https://graph.facebook.com https://*.facebook.com https://fonts.googleapis.com https://fonts.gstatic.com https://va.vercel-scripts.com https://api.web3forms.com https://api.razorpay.com https://*.razorpay.com https://lumberjack.razorpay.com https://*.r2.dev",
              "frame-src 'self' https://vercel.live https://accounts.google.com https://*.firebaseapp.com https://www.facebook.com https://web.facebook.com https://api.razorpay.com https://*.razorpay.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
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

  // Empty turbopack config (Next.js 16 uses Turbopack by default)
  turbopack: {},
};

export default nextConfig;
