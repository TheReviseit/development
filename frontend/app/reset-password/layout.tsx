import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password - Flowauxi",
  description: "Create a new password for your Flowauxi account",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
