"use client";

import React from "react";
import { CartProvider } from "./context/CartContext";

/**
 * Client-side providers for the store layout.
 * Extracted to keep layout.tsx as a server component (required for generateMetadata).
 */
export default function ClientProviders({
  children,
  username,
}: {
  children: React.ReactNode;
  username: string;
}) {
  return <CartProvider username={username}>{children}</CartProvider>;
}
