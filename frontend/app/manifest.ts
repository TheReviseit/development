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
        src: "/favicon.ico",
        sizes: "64x64 32x32 24x24 16x16",
        type: "image/x-icon",
      },
      {
        src: "/favicon.ico",
        sizes: "192x192",
        type: "image/x-icon",
      },
      {
        src: "/favicon.ico",
        sizes: "512x512",
        type: "image/x-icon",
      },
    ],
  };
}
