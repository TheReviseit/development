import React from "react";
import ClientProviders from "./ClientProviders";

/**
 * Store Layout — Server Component
 *
 * CRITICAL: This MUST be a server component (no "use client") so that
 * generateMetadata() works in page.tsx. The CartProvider and other
 * client-side providers live in ClientProviders.tsx.
 *
 * Architecture:
 *   layout.tsx (server) → ClientProviders.tsx (client) → children
 */

interface StoreLayoutProps {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}

export default async function StoreLayout({
  children,
  params,
}: StoreLayoutProps) {
  const { username } = await params;

  return <ClientProviders username={username}>{children}</ClientProviders>;
}
