import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/server/fetchWithTimeout";

const DEFAULT_VERIFY_TIMEOUT_MS = 3000;
const DEFAULT_ONBOARDING_TIMEOUT_MS = 5000;
const DEFAULT_AUTH_SYNC_TIMEOUT_MS = 8000;

/**
 * Stable client pool keyed by timeoutMs.
 *
 * Previously a single mutable singleton that got replaced whenever a caller
 * requested a different timeout (2500ms → 5000ms → 8000ms), causing connection
 * re-establishment overhead on every switch.  Now each unique timeout gets its
 * own persistent client instance — zero churn.
 */
const clientPool = new Map<number, SupabaseClient>();

function resolveSupabaseUrl(): string {
  const poolerUrl = process.env.SUPABASE_POOLER_URL?.trim();
  if (poolerUrl) {
    return poolerUrl;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return url;
}

/**
 * Shared Supabase service-role client.
 * Uses SUPABASE_POOLER_URL when set (dev and prod).
 *
 * Returns a stable client for the given timeout — no singleton replacement.
 */
export function getSupabaseServiceClient(options?: {
  timeoutMs?: number;
}): SupabaseClient {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;

  const existing = clientPool.get(timeoutMs);
  if (existing) {
    return existing;
  }

  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseServiceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const client = createClient(resolveSupabaseUrl(), supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createFetchWithTimeout(timeoutMs) },
  });
  clientPool.set(timeoutMs, client);

  return client;
}

export function createSupabaseServiceClientOrThrow(options?: {
  timeoutMs?: number;
}): SupabaseClient {
  return getSupabaseServiceClient({
    timeoutMs: options?.timeoutMs ?? DEFAULT_AUTH_SYNC_TIMEOUT_MS,
  });
}

/**
 * Pre-warm the Supabase connection pool by issuing a trivial query.
 * Call this in parallel with Firebase auth to overlap connection establishment
 * with the auth round-trip.  Errors are silently swallowed — warmup is best-effort.
 */
export async function warmupSupabaseConnection(
  timeoutMs: number = DEFAULT_ONBOARDING_TIMEOUT_MS,
): Promise<void> {
  try {
    const client = getSupabaseServiceClient({ timeoutMs });
    await client.rpc("get_onboarding_access_state", {
      p_firebase_uid: "__warmup__",
      p_product: "dashboard",
    });
  } catch {
    // Swallow — warmup is best-effort.  The RPC will return a
    // {userExists: false} stub for the fake UID, which is fine.
  }
}

export const AUTH_SYNC_SUPABASE_TIMEOUT_MS = DEFAULT_AUTH_SYNC_TIMEOUT_MS;
export const ONBOARDING_SUPABASE_TIMEOUT_MS = DEFAULT_ONBOARDING_TIMEOUT_MS;
