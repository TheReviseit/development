"use client";

import React, { use } from "react";
import { CartProvider } from "./context/CartContext";

export default function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = use(params);

  return (
    <CartProvider username={resolvedParams.username}>{children}</CartProvider>
  );
}
