/**
 * Store Cache — High-Performance In-Memory LRU Cache
 * ====================================================
 * Zero-dependency, server-side LRU cache for Next.js server processes.
 *
 * Why in-memory instead of Redis:
 *   - Next.js frontend has no Redis client dependency
 *   - Store data is small (~2-20KB per store), fits easily in memory
 *   - Sub-millisecond reads vs ~2-5ms Redis network round-trip
 *   - ISR already provides cross-request caching for SSR pages
 *   - This cache targets the API routes (/api/store/[username]) and
 *     the real-time polling path that bypasses ISR
 *
 * Architecture:
 *   - LRU eviction: least-recently-used entries evicted when capacity reached
 *   - TTL-based expiry: entries expire after configurable TTL
 *   - Stale-while-revalidate: serves stale data while refreshing in background
 *   - Version-based invalidation: bump version to invalidate specific stores
 *   - Namespace isolation: separate caches for different data types
 *
 * Capacity: 500 stores × ~20KB avg = ~10MB max memory footprint
 */

// =============================================================================
// LRU Cache Implementation
// =============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;       // Absolute timestamp (ms)
  staleAt: number;          // After this, serve but revalidate in background
  version: number;          // For targeted invalidation
  accessedAt: number;       // For LRU eviction
}

interface CacheStats {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  size: number;
  maxSize: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;
  private staleTtlMs: number;
  private stats: CacheStats;
  private revalidating = new Set<string>();

  constructor(options: {
    maxSize?: number;
    ttlSeconds?: number;
    staleTtlSeconds?: number;
  } = {}) {
    this.maxSize = options.maxSize ?? 500;
    this.ttlMs = (options.ttlSeconds ?? 30) * 1000;
    this.staleTtlMs = (options.staleTtlSeconds ?? 60) * 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      evictions: 0,
      size: 0,
      maxSize: this.maxSize,
    };
  }

  /**
   * Get a value from cache.
   * Returns { value, fresh } where fresh=false means stale-while-revalidate.
   */
  get(key: string): { value: T; fresh: boolean } | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    // Hard expired — remove and miss
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      this.stats.misses++;
      return null;
    }

    // Touch for LRU
    entry.accessedAt = now;

    // Fresh hit
    if (now <= entry.staleAt) {
      this.stats.hits++;
      return { value: entry.value, fresh: true };
    }

    // Stale hit — still return but caller should revalidate
    this.stats.staleHits++;
    return { value: entry.value, fresh: false };
  }

  /**
   * Set a value in cache. Evicts LRU entry if at capacity.
   */
  set(key: string, value: T, version = 0): void {
    // Evict if at capacity and key is new
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      expiresAt: now + this.staleTtlMs,
      staleAt: now + this.ttlMs,
      version,
      accessedAt: now,
    });
    this.stats.size = this.cache.size;
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  /**
   * Delete all keys matching a prefix.
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.stats.size = this.cache.size;
    return count;
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Check if a key is currently being revalidated (prevents stampede).
   */
  isRevalidating(key: string): boolean {
    return this.revalidating.has(key);
  }

  /**
   * Mark a key as being revalidated.
   */
  markRevalidating(key: string): void {
    this.revalidating.add(key);
  }

  /**
   * Unmark revalidation.
   */
  unmarkRevalidating(key: string): void {
    this.revalidating.delete(key);
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  private evictLRU(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
      this.stats.evictions++;
    }
  }
}

// =============================================================================
// Singleton Cache Instances (survive across requests in Next.js server)
// =============================================================================

/** Store data cache — full PublicStore objects */
export const storeDataCache = new LRUCache({
  maxSize: 500,
  ttlSeconds: 30,           // Fresh for 30s
  staleTtlSeconds: 120,     // Serve stale up to 2 minutes while revalidating
});

/** Slug resolution cache — slug → { userId, canonicalSlug } */
export const slugCache = new LRUCache<{
  userId: string;
  canonicalSlug: string;
}>({
  maxSize: 1000,
  ttlSeconds: 300,           // 5 minutes — slugs rarely change
  staleTtlSeconds: 600,      // 10 minutes stale tolerance
});

/** Store version cache — slug → updated_at timestamp for lightweight polling */
export const versionCache = new LRUCache<string>({
  maxSize: 1000,
  ttlSeconds: 5,             // Very short — version checks must be near-realtime
  staleTtlSeconds: 15,
});

/** Payment settings cache — slug → payment config */
export const paymentSettingsCache = new LRUCache<{
  paymentsEnabled: boolean;
  razorpayKeyId: string | null;
  codAvailable: boolean;
  shippingCharges: string | null;
}>({
  maxSize: 500,
  ttlSeconds: 60,            // 1 minute — payment settings rarely change
  staleTtlSeconds: 300,
});

// =============================================================================
// Cache Key Helpers
// =============================================================================

export function storeKey(slug: string): string {
  return `store:${slug.toLowerCase().trim()}`;
}

export function slugKey(slug: string): string {
  return `slug:${slug.toLowerCase().trim()}`;
}

export function versionKey(slug: string): string {
  return `ver:${slug.toLowerCase().trim()}`;
}

export function paymentKey(slug: string): string {
  return `pay:${slug.toLowerCase().trim()}`;
}

// =============================================================================
// Invalidation Helpers
// =============================================================================

/**
 * Invalidate all cached data for a specific store.
 * Call this when store data is updated (from Flask webhook or save endpoint).
 */
export function invalidateStore(slug: string): void {
  const normalized = slug.toLowerCase().trim();
  storeDataCache.delete(`store:${normalized}`);
  versionCache.delete(`ver:${normalized}`);
  paymentSettingsCache.delete(`pay:${normalized}`);
  // Don't invalidate slug cache — slug changes are rare and handled separately
}

/**
 * Invalidate slug mapping (only needed when URL slug changes).
 */
export function invalidateSlug(slug: string): void {
  slugCache.delete(`slug:${slug.toLowerCase().trim()}`);
}

/**
 * Invalidate everything for a user (by userId).
 * Used when subscription/plan changes affect all cached store data.
 */
export function invalidateByUserId(userId: string): void {
  // Slug cache maps slug→userId, so we need to scan
  // This is O(n) but rare (only on plan changes)
  storeDataCache.deleteByPrefix("store:");
  paymentSettingsCache.deleteByPrefix("pay:");
  versionCache.deleteByPrefix("ver:");
}

/**
 * Get aggregated cache stats for monitoring.
 */
export function getAllCacheStats() {
  return {
    storeData: storeDataCache.getStats(),
    slugResolution: slugCache.getStats(),
    storeVersion: versionCache.getStats(),
    paymentSettings: paymentSettingsCache.getStats(),
  };
}
