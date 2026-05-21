from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, asdict
from threading import Lock
from typing import Any


@dataclass(frozen=True)
class RoutingCacheEntry:
    domain_id: str
    tenant_id: str
    user_id: str
    product_domain: str
    normalized_host: str
    routing_version: int
    routing_enabled: bool
    status: str
    store_slug: str
    cached_at: float
    expires_at: float
    alias_host: str | None = None

    def is_usable(self, hard_check_after_seconds: int) -> bool:
        now = time.time()
        if now >= self.expires_at:
            return False
        if not self.routing_enabled or self.status != "active":
            return False
        return now - self.cached_at <= hard_check_after_seconds


class DomainRoutingCache:
    def __init__(self, redis_url: str | None = None):
        self._memory: dict[str, RoutingCacheEntry] = {}
        self._lock = Lock()
        self._redis = None
        self._ttl_seconds = int(os.getenv("DOMAIN_ROUTING_CACHE_TTL_SECONDS", "120"))
        self._hard_check_after_seconds = int(os.getenv("DOMAIN_ROUTING_HARD_CHECK_SECONDS", "30"))
        redis_url = redis_url or os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self._redis = redis.from_url(redis_url, socket_timeout=1, socket_connect_timeout=1)
                self._redis.ping()
            except Exception:
                self._redis = None

    @property
    def hard_check_after_seconds(self) -> int:
        return self._hard_check_after_seconds

    def get(self, host: str) -> RoutingCacheEntry | None:
        key = self._key(host)
        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw:
                    entry = RoutingCacheEntry(**json.loads(raw))
                    return entry if entry.is_usable(self._hard_check_after_seconds) else None
            except Exception:
                pass
        with self._lock:
            entry = self._memory.get(key)
            if entry and entry.is_usable(self._hard_check_after_seconds):
                return entry
            self._memory.pop(key, None)
        return None

    def set(self, host: str, value: dict[str, Any]) -> RoutingCacheEntry:
        now = time.time()
        entry = RoutingCacheEntry(
            **value,
            cached_at=now,
            expires_at=now + self._ttl_seconds,
        )
        key = self._key(host)
        payload = json.dumps(asdict(entry), separators=(",", ":"))
        if self._redis is not None:
            try:
                self._redis.setex(key, self._ttl_seconds, payload)
            except Exception:
                pass
        with self._lock:
            self._memory[key] = entry
        return entry

    def invalidate(self, host: str) -> None:
        key = self._key(host)
        if self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception:
                pass
        with self._lock:
            self._memory.pop(key, None)

    def _key(self, host: str) -> str:
        return f"domain:routing:{host}"


_cache: DomainRoutingCache | None = None


def get_domain_routing_cache() -> DomainRoutingCache:
    global _cache
    if _cache is None:
        _cache = DomainRoutingCache()
    return _cache
