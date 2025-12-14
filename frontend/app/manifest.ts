import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReviseIt - AI WhatsApp Automation & Business Messaging Platform",
    short_name: "ReviseIt",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Automate customer responses, send broadcasts, and integrate with CRM systems.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#22C15A",
    orientation: "portrait-primary",
    scope: "/",
    lang: "en-US",
    dir: "ltr",
    categories: [
      "business",
      "productivity",
      "communication",
      "messaging",
      "automation",
    ],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/og-image.png",
        sizes: "1200x630",
        type: "image/png",
        label: "ReviseIt Dashboard Overview",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Go to your ReviseIt dashboard",
        url: "/dashboard",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Login",
        short_name: "Login",
        description: "Sign in to ReviseIt",
        url: "/login",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}
