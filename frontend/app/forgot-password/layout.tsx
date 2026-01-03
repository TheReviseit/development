import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password - ReviseIt",
  description: "Reset your ReviseIt account password",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
