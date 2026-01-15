"use client";

import React, { use } from "react";
import { CartProvider } from "./context/CartContext";

export default function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <CartProvider storeSlug={resolvedParams.storeSlug}>{children}</CartProvider>
  );
}
