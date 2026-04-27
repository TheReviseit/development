import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; retryAfterSeconds: number; remaining?: number };

function getEnvRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(key: string, limitPerMinute: number): Ratelimit | null {
  const env = getEnvRedis();
  if (!env) return null;

  const cacheKey = `${key}:${limitPerMinute}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;

  const redis = new Redis({ url: env.url, token: env.token });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limitPerMinute, "1 m"),
    prefix: `flowauxi:${key}`,
    analytics: true,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export async function checkRateLimit(params: {
  namespace: "authsync:ip" | "authsync:uid";
  key: string;
  limitPerMinute: number;
}): Promise<RateLimitResult> {
  const { namespace, key, limitPerMinute } = params;

  const limiter = getLimiter(namespace, limitPerMinute);
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

