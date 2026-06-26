import { createClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/server/fetchWithTimeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Legacy admin timeout — prevents infinite hangs on cold Supabase connections.
 * Previously this client had NO timeout, so getUserByFirebaseUID,
 * getWhatsAppAccountsByUserId, and getSubscriptionByUserId could hang forever.
 */
const LEGACY_ADMIN_TIMEOUT_MS = 10_000;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("- SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗");
  throw new Error(
    "Missing Supabase service role credentials. Please add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env.local file"
  );
}

// This client bypasses Row Level Security and should only be used server-side
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: createFetchWithTimeout(LEGACY_ADMIN_TIMEOUT_MS),
  },
});
