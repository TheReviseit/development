// Centralized metadata configurations for different pages
// This helps maintain consistent and optimized SEO across all pages

import { Metadata } from "next";

const baseUrl = "https://www.flowauxi.com";

// Homepage metadata
export const homeMetadata: Metadata = {
  title: "Flowauxi - AI WhatsApp Automation & OTP API Platform",
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Plus OTP Verification API for secure authentication via WhatsApp & SMS. Trusted by 500+ businesses. Start your 14-day free trial today!",
  keywords: [
    "WhatsApp automation",
    "WhatsApp business API",
    "AI WhatsApp chatbot",
    "automated customer support",
    "WhatsApp CRM integration",
    // OTP API keywords
    "OTP API",
    "OTP verification API",
    "WhatsApp OTP",
    "SMS OTP API",
    "phone verification API",
    "2FA API",
    "two-factor authentication API",
  ],
  openGraph: {
    title: "Flowauxi - AI WhatsApp Automation & OTP API Platform | Free Trial",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Plus secure OTP Verification API. Trusted by 500+ businesses.",
    url: baseUrl,
    type: "website",
    images: [
      {
        url: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Flowauxi - WhatsApp Automation & OTP API Platform",
      },
    ],
  },
};

// Pricing page metadata
export const pricingMetadata: Metadata = {
  title: "Pricing Plans - WhatsApp Automation for Every Business Size",
  description:
    "Flexible pricing for WhatsApp automation. Start free with 14-day trial. Plans for startups, growing businesses, and enterprises. No credit card required.",
  keywords: [
    "WhatsApp automation pricing",
    "WhatsApp API pricing",
    "business messaging plans",
    "affordable WhatsApp automation",
  ],
  openGraph: {
    title: "Flowauxi Pricing - WhatsApp Automation Plans",
    description:
      "Flexible pricing for WhatsApp automation. Start free with 14-day trial.",
    url: `${baseUrl}/pricing`,
  },
};

// Features page metadata
export const featuresMetadata: Metadata = {
  title: "Features - AI-Powered WhatsApp Automation Tools & Capabilities",
  description:
    "Discover powerful WhatsApp automation features: AI auto-responses, smart broadcasting, CRM integration, analytics dashboard, and more. See how Flowauxi transforms business messaging.",
  keywords: [
    "WhatsApp automation features",
    "AI chatbot capabilities",
    "WhatsApp broadcast tools",
    "messaging analytics",
  ],
  openGraph: {
    title: "Flowauxi Features - WhatsApp Automation Capabilities",
    description:
      "AI auto-responses, smart broadcasting, CRM integration, and powerful analytics for business messaging.",
    url: `${baseUrl}/features`,
  },
};

// Login page metadata
export const loginMetadata: Metadata = {
  title: "Login - Access Your WhatsApp Automation Dashboard",
  description:
    "Sign in to your Flowauxi account to manage WhatsApp automation, view analytics, and handle customer conversations.",
  robots: {
    index: false,
    follow: true,
  },
};

// Signup page metadata
export const signupMetadata: Metadata = {
  title: "Sign Up - Start Your Free WhatsApp Automation Trial",
  description:
    "Create your Flowauxi account and start automating WhatsApp messages in minutes. 14-day free trial, no credit card required.",
  openGraph: {
    title: "Sign Up for Flowauxi - Free WhatsApp Automation Trial",
    description:
      "Start automating WhatsApp in minutes. 14-day free trial, no credit card required.",
    url: `${baseUrl}/signup`,
  },
};

// Privacy Policy metadata
export const privacyMetadata: Metadata = {
  title: "Privacy Policy - How Flowauxi Protects Your Data",
  description:
    "Learn how Flowauxi collects, uses, and protects your data. Our commitment to privacy and data security.",
  robots: {
    index: true,
    follow: true,
  },
};

// Terms of Service metadata
export const termsMetadata: Metadata = {
  title: "Terms of Service - Flowauxi Usage Agreement",
  description:
    "Read Flowauxi's terms of service, usage guidelines, and legal agreements for using our WhatsApp automation platform.",
  robots: {
    index: true,
    follow: true,
  },
};

// About page metadata (when you create it)
export const aboutMetadata: Metadata = {
  title: "About Us - Flowauxi's Mission to Transform Business Messaging",
  description:
    "Learn about Flowauxi's journey, our team, and our mission to make WhatsApp automation accessible for every business.",
  keywords: ["about Flowauxi", "WhatsApp automation company", "our story"],
};

// Contact page metadata (when you create it)
export const contactMetadata: Metadata = {
  title: "Contact Us - Get Help with WhatsApp Automation",
  description:
    "Need help with WhatsApp automation? Contact Flowauxi's support team. We're here to help you succeed.",
  keywords: [
    "contact Flowauxi",
    "WhatsApp automation support",
    "customer service",
  ],
};

// Blog page metadata (when you create it)
export const blogMetadata: Metadata = {
  title: "Blog - WhatsApp Automation Tips, Guides & Best Practices",
  description:
    "Expert insights on WhatsApp automation, business messaging strategies, and customer engagement tips from Flowauxi.",
  keywords: [
    "WhatsApp automation blog",
    "business messaging tips",
    "customer engagement guides",
  ],
};
