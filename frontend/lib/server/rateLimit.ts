import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitWindow = "1 m" | "1 h";

type RateLimitResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; retryAfterSeconds: number; remaining?: number };

export type RateLimitNamespace =
  | "authsync:ip"
  | "authsync:uid"
  | "verify:send:uid"
  | "verify:verify:uid"
  | "verify:ip";

function getEnvRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(
  namespace: RateLimitNamespace,
  limit: number,
  window: RateLimitWindow,
): Ratelimit | null {
  const env = getEnvRedis();
  if (!env) return null;

  const cacheKey = `${namespace}:${limit}:${window}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;

  const redis = new Redis({ url: env.url, token: env.token });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `flowauxi:${namespace}`,
    analytics: true,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export async function checkRateLimit(params: {
  namespace: RateLimitNamespace;
  key: string;
  limitPerMinute?: number;
  limitPerHour?: number;
}): Promise<RateLimitResult> {
  const { namespace, key } = params;
  const limit = params.limitPerHour ?? params.limitPerMinute ?? 60;
  const window: RateLimitWindow = params.limitPerHour != null ? "1 h" : "1 m";

  const limiter = getLimiter(namespace, limit, window);
  if (!limiter) {
    return { allowed: true };
  }

  const result = await limiter.limit(key);
  if (result.success) {
    return { allowed: true, remaining: result.remaining };
  }

  const now = Date.now();
  const resetMs = Math.max(0, result.reset - now);
  const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));

  return { allowed: false, retryAfterSeconds, remaining: result.remaining };
}
