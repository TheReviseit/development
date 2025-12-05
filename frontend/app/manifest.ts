import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReviseIt - WhatsApp Automation",
    short_name: "ReviseIt",
    description: "AI-Powered WhatsApp Automation for Business",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#22C15A",
    icons: [
      {
        src: "/logo.png",
        sizes: "48x48",
        type: "image/png",
        purpose: "any",
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
      },
    ],
  };
}
