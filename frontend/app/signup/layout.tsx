import { Metadata } from "next";

// Signup page metadata - highly optimized for conversions
export const metadata: Metadata = {
  title: "Sign Up Free - WhatsApp Automation | 14-Day Trial",
  description:
    "Create your free ReviseIt account in 60 seconds. Start automating WhatsApp messages with AI-powered responses. No credit card required for 14-day trial. Join 500+ businesses automating customer conversations.",
  keywords: [
    "WhatsApp automation signup",
    "free WhatsApp automation trial",
    "create WhatsApp business account",
    "WhatsApp chatbot free trial",
    "automated messaging signup",
  ],
  openGraph: {
    title: "Sign Up for ReviseIt - Free WhatsApp Automation Trial",
    description:
      "Start automating WhatsApp in 60 seconds. 14-day free trial, no credit card required. Join 500+ businesses.",
    url: "https://www.reviseit.in/signup",
    images: [
      {
        url: "https://www.reviseit.in/og-image.png",
        width: 1200,
        height: 630,
        alt: "ReviseIt Signup - Start Free Trial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Start Your Free WhatsApp Automation Trial",
    description:
      "Create your account in 60 seconds. No credit card required for 14-day trial.",
    images: ["https://www.reviseit.in/twitter-image.png"],
  },
  alternates: {
    canonical: "https://www.reviseit.in/signup",
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
