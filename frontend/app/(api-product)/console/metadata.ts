import type { Metadata } from "next";

/**
 * Console pages have restricted indexing
 * Login/signup pages should have noindex
 */

export const consoleLoginMetadata: Metadata = {
  title: "Login | Flowauxi Developer Console",
  description:
    "Sign in to your Flowauxi developer console to manage API keys, view logs, and monitor OTP usage.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  openGraph: {
    title: "Sign In | Flowauxi Console",
    description: "Access your OTP API dashboard",
    type: "website",
    locale: "en_IN",
    siteName: "Flowauxi",
  },
};

export const consoleSignupMetadata: Metadata = {
  title: "Create Account | Flowauxi Developer Console",
  description:
    "Sign up for a free Flowauxi developer account. Get your API keys in seconds and start sending OTPs.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  openGraph: {
    title: "Create Account | Flowauxi Console",
    description: "Start building with OTP verification in minutes",
    type: "website",
    locale: "en_IN",
    siteName: "Flowauxi",
  },
};

export const consoleDashboardMetadata: Metadata = {
  title: "Dashboard | Flowauxi Developer Console",
  description:
    "Monitor your OTP API usage, manage API keys, and view delivery logs in the Flowauxi developer console.",
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};
