/**
 * Store Page - Server Component
 *
 * Fetches store data server-side directly from Supabase.
 * This eliminates the client-side /api/store/ fetch and routing ambiguity.
 *
 * Canonical redirect: If the URL slug doesn't match the store's
 * canonical slug, we issue a permanent redirect (e.g., username → slug).
 */

import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/store";
import StoreClientPage from "./client-page";

export const revalidate = 0;
export const dynamic = "force-dynamic";

interface StorePageProps {
  params: Promise<{ username: string }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { username } = await params;

  if (!username || username.length < 1) {
    notFound();
  }

  console.log(`[StorePage SSR] Fetching store for: "${username}"`);
  const storeData = await getStoreBySlug(username);
  console.log(`[StorePage SSR] Result: ${storeData ? "FOUND" : "NULL"}`);

  if (!storeData) {
    notFound();
  }

  // ── CANONICAL REDIRECT ─────────────────────────────────────────────
  // If the URL slug doesn't match the canonical slug, redirect.
  // This handles: username → slug, mixed case → lowercase, UID → slug
  if (
    storeData.canonicalSlug &&
    username.toLowerCase() !== storeData.canonicalSlug.toLowerCase()
  ) {
    console.log(
      `[StorePage SSR] Redirecting ${username} → ${storeData.canonicalSlug}`,
    );
    redirect(`/store/${storeData.canonicalSlug}`);
  }

  return <StoreClientPage username={username} initialData={storeData} />;
}
