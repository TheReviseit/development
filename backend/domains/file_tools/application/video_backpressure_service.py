"""Rate limits and queue back-pressure for video file tools."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any

from ..domain.errors import RateLimitError


@dataclass(frozen=True)
class TokenBucketPolicy:
    capacity: int
    refill_per_second: float


DEFAULT_POLICIES = {
    "upload_session": TokenBucketPolicy(capacity=6, refill_per_second=1 / 30),
    "chunk_upload": TokenBucketPolicy(capacity=64, refill_per_second=2),
    "job_create": TokenBucketPolicy(capacity=4, refill_per_second=1 / 60),
    "retry": TokenBucketPolicy(capacity=3, refill_per_second=1 / 120),
    "sse": TokenBucketPolicy(capacity=12, refill_per_second=1 / 10),
}


class VideoBackpressureService:
    def __init__(self, redis_client: Any | None = None):
        self._redis = redis_client or self._connect_redis()
        self._memory: dict[str, tuple[float, float]] = {}
        self._lock = Lock()

    def assert_allowed(self, identity: str, operation: str) -> None:
        policy = DEFAULT_POLICIES[operation]
        key = f"file-tools:video:bucket:{operation}:{identity}"
        allowed = self._take_redis(key, policy) if self._redis is not None else self._take_memory(key, policy)
        if not allowed:
            raise RateLimitError("Too many video requests. Please retry shortly.")

    def assert_queue_open(self, queue_name: str) -> None:
        max_depth = int(os.getenv(f"FILE_TOOLS_{queue_name.upper()}_MAX_DEPTH", "100"))
        depth = self.queue_depth(queue_name)
        if depth >= max_depth:
            raise RateLimitError("Video processing is busy. Please retry shortly.")

    def queue_depth(self, queue_name: str) -> int:
        if self._redis is None:
            return 0
        try:
            return int(self._redis.llen(queue_name))
        except Exception:
            return 0

    def _take_memory(self, key: str, policy: TokenBucketPolicy) -> bool:
        now = time.time()
        with self._lock:
            tokens, last = self._memory.get(key, (float(policy.capacity), now))
            tokens = min(float(policy.capacity), tokens + (now - last) * policy.refill_per_second)
            if tokens < 1:
                self._memory[key] = (tokens, now)
                return False
            self._memory[key] = (tokens - 1, now)
            return True

    def _take_redis(self, key: str, policy: TokenBucketPolicy) -> bool:
        now = time.time()
        script = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local bucket = redis.call('HMGET', key, 'tokens', 'updated')
local tokens = tonumber(bucket[1]) or capacity
local updated = tonumber(bucket[2]) or now
tokens = math.min(capacity, tokens + ((now - updated) * refill))
if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
  redis.call('EXPIRE', key, ttl)
  return 0
end
tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'updated', now)
redis.call('EXPIRE', key, ttl)
return 1
"""
        try:
            ttl = max(60, int(policy.capacity / max(policy.refill_per_second, 0.001) * 2))
            return bool(self._redis.eval(script, 1, key, policy.capacity, policy.refill_per_second, now, ttl))
        except Exception:
            return self._take_memory(key, policy)

    def _connect_redis(self):
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            return None
        try:
            import redis

            client = redis.Redis.from_url(redis_url, socket_timeout=1, socket_connect_timeout=1)
            client.ping()
            return client
        except Exception:
            return None
