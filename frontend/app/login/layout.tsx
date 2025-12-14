import { Metadata } from "next";

// Login page metadata - optimized for user access, not search visibility
export const metadata: Metadata = {
  title: "Login - Access Your WhatsApp Automation Dashboard | ReviseIt",
  description:
    "Sign in to your ReviseIt account to manage WhatsApp automation, view analytics, and handle customer conversations. Secure login to your business messaging dashboard.",
  robots: {
    index: false, // Don't index login page
    follow: true, // But follow links from it
  },
  openGraph: {
    title: "Login to ReviseIt",
    description: "Access your WhatsApp automation dashboard",
    url: "https://www.reviseit.in/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

