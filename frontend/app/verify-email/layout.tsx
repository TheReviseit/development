import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Your Email - Flowauxi",
  description: "Verify your email address to activate your Flowauxi account",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VerifyEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
