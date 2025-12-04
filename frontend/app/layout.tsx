import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ReviseIt - AI-Powered WhatsApp Automation for Business",
  description:
    "Automate WhatsApp messaging with AI-powered responses, smart workflows, and CRM integration. Trusted by 500+ growing businesses.",
  keywords: [
    "WhatsApp automation",
    "AI messaging",
    "business automation",
    "WhatsApp API",
    "CRM integration",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${outfit.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
