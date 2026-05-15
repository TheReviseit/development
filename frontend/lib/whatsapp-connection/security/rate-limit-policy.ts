import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitDecision =
  | { allowed: true; remaining?: number }
  | { allowed: false; retryAfterSeconds: number; remaining?: number };

const limiterCache = new Map<string, Ratelimit>();

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getLimiter(namespace: string, limit: number, window: "1 m" | "10 m") {
  const redis = getRedis();
  if (!redis) return null;

  const key = `${namespace}:${limit}:${window}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `flowauxi:wa:${namespace}`,
    analytics: true,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

export async function checkWhatsAppConnectionRateLimit(params: {
  namespace: string;
  key: string;
  limit: number;
  window?: "1 m" | "10 m";
}): Promise<RateLimitDecision> {
  const limiter = getLimiter(params.namespace, params.limit, params.window ?? "1 m");
  if (!limiter) return { allowed: true };

  const result = await limiter.limit(params.key);
  if (result.success) {
    return { allowed: true, remaining: result.remaining };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return {
    allowed: false,
    retryAfterSeconds,
    remaining: result.remaining,
  };
}
