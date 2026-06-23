/**
 * Billing runtime flags — fetched from Flask with 30s client cache.
 */

export type RuntimeFlags = Record<string, string | number | boolean>;

let cache: RuntimeFlags | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

const DEFAULTS: RuntimeFlags = {
  fix_domain_context: true,
  billing_behavior_pinning: true,
  canary_percent: 0,
  billing_timeout_ms: 20000,
  cb_threshold: 10,
  cb_count_timeout_as_failure: false,
  billing_sync_checkout: false,
  checkout_bg_max_workers: 1,
};

export async function getRuntimeFlags(forceRefresh = false): Promise<RuntimeFlags> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return { ...cache };
  }

  try {
    const response = await fetch("/api/billing/runtime-flags", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (response.ok) {
      const data = await response.json();
      cache = { ...DEFAULTS, ...(data.flags || {}) };
      cacheLoadedAt = now;
      return { ...cache };
    }
  } catch {
    // fall through
  }

  cache = { ...DEFAULTS };
  cacheLoadedAt = now;
  return { ...cache };
}

export function getCachedRuntimeFlags(): RuntimeFlags {
  return cache ? { ...cache } : { ...DEFAULTS };
}

export function invalidateRuntimeFlagsCache(): void {
  cacheLoadedAt = 0;
}
