import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Your Email - ReviseIt",
  description: "Verify your email address to activate your ReviseIt account",
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
