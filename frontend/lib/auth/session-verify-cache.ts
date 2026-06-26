import { createHash } from "crypto";
import { adminAuth } from "@/lib/firebase-admin";
import { withTimeout } from "@/lib/server/fetchWithTimeout";

/**
 * SESSION VERIFY CACHE TTL (default 20s)
 * Tradeoff: cache hit skips a Firebase revocation round-trip (~400ms saved).
 * Risk: a revoked session may pass verify for up to TTL seconds.
 * We accept 20s (not 45s) because email verification is security-sensitive.
 * Invalidate on logout/password-change. Override via VERIFY_SESSION_CACHE_TTL_MS
 * only with security review.
 */
export const DEFAULT_SESSION_VERIFY_CACHE_TTL_MS = 20_000;
const MAX_SESSION_VERIFY_CACHE_TTL_MS = 30_000;
const VERIFY_SESSION_MISS_TIMEOUT_MS = 2000;

type CachedSession = {
  uid: string;
  expiresAtMs: number;
};

const cache = new Map<string, CachedSession>();

function isCacheEnabled(): boolean {
  return process.env.VERIFY_SESSION_CACHE_ENABLED !== "false";
}

function resolveCacheTtlMs(): number {
  const raw = process.env.VERIFY_SESSION_CACHE_TTL_MS?.trim();
  if (raw === "0") return 0;

  const parsed = raw ? Number(raw) : DEFAULT_SESSION_VERIFY_CACHE_TTL_MS;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SESSION_VERIFY_CACHE_TTL_MS;
  }

  return Math.min(parsed, MAX_SESSION_VERIFY_CACHE_TTL_MS);
}

function cacheKey(sessionCookie: string): string {
  return createHash("sha256").update(sessionCookie).digest("hex");
}

export function invalidateSessionVerifyCache(sessionCookie?: string | null): void {
  if (!sessionCookie) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(sessionCookie));
}

export function invalidateAllSessionVerifyCache(): void {
  cache.clear();
}

export async function verifySessionCookieCached(
  sessionCookie: string,
): Promise<{ uid: string; cacheHit: boolean }> {
  const ttlMs = resolveCacheTtlMs();
  const key = cacheKey(sessionCookie);
  const now = Date.now();

  if (isCacheEnabled() && ttlMs > 0) {
    const hit = cache.get(key);
    if (hit && hit.expiresAtMs > now) {
      return { uid: hit.uid, cacheHit: true };
    }
  }

  const decoded = await withTimeout(
    adminAuth.verifySessionCookie(sessionCookie, true),
    VERIFY_SESSION_MISS_TIMEOUT_MS,
    "FIREBASE_VERIFY_SESSION_COOKIE_TIMEOUT",
  );

  if (isCacheEnabled() && ttlMs > 0) {
    cache.set(key, { uid: decoded.uid, expiresAtMs: now + ttlMs });
  }

  return { uid: decoded.uid, cacheHit: false };
}
