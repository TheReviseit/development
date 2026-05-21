"""Tenant-scoped call-session stores."""

from __future__ import annotations

import json
import os
from typing import Any, Protocol

from ..domain.entities import CallSession
from ..domain.policies import TenantIsolationPolicy


class SessionStore(Protocol):
    def get(self, tenant_id: str, call_id: str) -> CallSession | None:
        ...

    def save(self, session: CallSession, ttl_seconds: int = 7200) -> None:
        ...

    def delete(self, tenant_id: str, call_id: str) -> None:
        ...


class InMemorySessionStore:
    def __init__(self):
        self._sessions: dict[str, dict[str, Any]] = {}

    def get(self, tenant_id: str, call_id: str) -> CallSession | None:
        payload = self._sessions.get(self._key(tenant_id, call_id))
        return CallSession.from_dict(payload) if payload else None

    def save(self, session: CallSession, ttl_seconds: int = 7200) -> None:
        self._sessions[self._key(session.tenant.tenant_id, session.call_id)] = session.to_dict()

    def delete(self, tenant_id: str, call_id: str) -> None:
        self._sessions.pop(self._key(tenant_id, call_id), None)

    @staticmethod
    def _key(tenant_id: str, call_id: str) -> str:
        return TenantIsolationPolicy.redis_key(tenant_id, "call", call_id)


class RedisSessionStore:
    def __init__(self, redis_client: Any):
        self._redis = redis_client

    def get(self, tenant_id: str, call_id: str) -> CallSession | None:
        raw = self._redis.get(self._key(tenant_id, call_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return CallSession.from_dict(json.loads(raw))

    def save(self, session: CallSession, ttl_seconds: int = 7200) -> None:
        self._redis.setex(
            self._key(session.tenant.tenant_id, session.call_id),
            ttl_seconds,
            json.dumps(session.to_dict(), default=str),
        )

    def delete(self, tenant_id: str, call_id: str) -> None:
        self._redis.delete(self._key(tenant_id, call_id))

    @staticmethod
    def _key(tenant_id: str, call_id: str) -> str:
        return TenantIsolationPolicy.redis_key(tenant_id, "call", call_id)


def create_session_store(redis_url: str | None = None) -> SessionStore:
    redis_url = redis_url or os.getenv("REDIS_URL")
    if not redis_url:
        return InMemorySessionStore()
    try:
        import redis

        client = redis.from_url(redis_url, decode_responses=True, socket_timeout=1, socket_connect_timeout=1)
        client.ping()
        return RedisSessionStore(client)
    except Exception:
        return InMemorySessionStore()

