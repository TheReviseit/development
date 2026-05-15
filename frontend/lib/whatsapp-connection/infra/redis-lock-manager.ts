import { Redis } from "@upstash/redis";
import { WhatsAppConnectionError } from "../domain/errors";

interface LockHandle {
  key: string;
  owner: string;
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export class ConnectionLockManager {
  private readonly redis = getRedis();

  async withLocks<T>(
    resourceKeys: string[],
    callback: () => Promise<T>,
    options: { ttlSeconds?: number; waitMs?: number } = {},
  ): Promise<T> {
    const uniqueKeys = [...new Set(resourceKeys.filter(Boolean))].sort();
    const acquired: LockHandle[] = [];
    const ttlSeconds = options.ttlSeconds ?? 30;
    const waitMs = options.waitMs ?? 3000;
    const startedAt = Date.now();

    try {
      for (const resourceKey of uniqueKeys) {
        const handle = await this.acquire(resourceKey, ttlSeconds, waitMs, startedAt);
        acquired.push(handle);
      }

      return await callback();
    } finally {
      await Promise.allSettled(acquired.reverse().map((lock) => this.release(lock)));
    }
  }

  private async acquire(
    resourceKey: string,
    ttlSeconds: number,
    waitMs: number,
    startedAt: number,
  ): Promise<LockHandle> {
    const key = `wa:connect:${resourceKey}`;
    const owner = crypto.randomUUID();

    if (!this.redis) {
      return { key, owner };
    }

    while (Date.now() - startedAt < waitMs) {
      const result = await this.redis.set(key, owner, { nx: true, ex: ttlSeconds });
      if (result === "OK") {
        return { key, owner };
      }
      await new Promise((resolve) => setTimeout(resolve, 75));
    }

    throw new WhatsAppConnectionError(
      "CONNECTION_IN_PROGRESS",
      "A connection attempt is already in progress for this WhatsApp resource.",
      423,
      { resourceKey },
    );
  }

  private async release(lock: LockHandle) {
    if (!this.redis) return;
    const currentOwner = await this.redis.get<string>(lock.key);
    if (currentOwner === lock.owner) {
      await this.redis.del(lock.key);
    }
  }
}
