"""
Redis-backed Circuit Breaker — shared state across all workers.
===============================================================

Replaces the per-worker in-memory circuit breaker in billing_api.py.
All Gunicorn workers share the same circuit breaker state via Redis,
preventing 503 errors when one worker opens but others don't know.

Feature flag: REDIS_CIRCUIT_BREAKER=true (default: false)
When false, falls back to the in-memory CircuitBreaker.

Lua script guarantees atomic state transitions:

    CLOSED ──(failure_threshold)──→ OPEN
    OPEN ──(recovery_timeout)──→ HALF_OPEN
    HALF_OPEN ──(success)──→ CLOSED
    HALF_OPEN ──(failure)──→ OPEN
"""

import json
import time
import os
import logging

logger = logging.getLogger('reviseit.circuit_breaker_redis')

CB_LUA_CHECK = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local failure_threshold = tonumber(ARGV[2])
local recovery_timeout = tonumber(ARGV[3])
local half_open_max = tonumber(ARGV[4])

local raw = redis.call('GET', key)
if not raw then
    return cjson.encode({state='closed', allowed=1})
end

local cb = cjson.decode(raw)
local state = cb.state

if state == 'closed' then
    return cjson.encode({state='closed', allowed=1})
end

if state == 'open' then
    if (now - cb.last_failure_time) >= recovery_timeout then
        cb.state = 'half_open'
        cb.half_open_calls = 0
        redis.call('SET', key, cjson.encode(cb), 'EX', 86400)
        return cjson.encode({state='half_open', allowed=1})
    end
    return cjson.encode({state='open', allowed=0})
end

if state == 'half_open' then
    if cb.half_open_calls < half_open_max then
        cb.half_open_calls = cb.half_open_calls + 1
        redis.call('SET', key, cjson.encode(cb), 'EX', 86400)
        return cjson.encode({state='half_open', allowed=1})
    end
    return cjson.encode({state='half_open', allowed=0})
end

return cjson.encode({state='unknown', allowed=0})
"""

CB_LUA_RECORD_FAILURE = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local failure_threshold = tonumber(ARGV[2])

local raw = redis.call('GET', key)
local cb
if raw then
    cb = cjson.decode(raw)
else
    cb = {state='closed', failure_count=0, last_failure_time=0, half_open_calls=0, success_count=0}
end

cb.failure_count = (cb.failure_count or 0) + 1
cb.last_failure_time = now
cb.success_count = 0

if cb.state == 'half_open' then
    cb.state = 'open'
elseif cb.failure_count >= failure_threshold then
    cb.state = 'open'
end

redis.call('SET', key, cjson.encode(cb), 'EX', 86400)
return cjson.encode(cb)
"""

CB_LUA_RECORD_SUCCESS = """
local key = KEYS[1]
local half_open_max = tonumber(ARGV[1])

local raw = redis.call('GET', key)
if not raw then
    return cjson.encode({state='closed', failure_count=0})
end

local cb = cjson.decode(raw)

if cb.state == 'half_open' then
    cb.success_count = (cb.success_count or 0) + 1
    if cb.success_count >= half_open_max then
        cb.state = 'closed'
        cb.failure_count = 0
        cb.half_open_calls = 0
        cb.success_count = 0
    end
    redis.call('SET', key, cjson.encode(cb), 'EX', 86400)
    return cjson.encode(cb)
end

cb.failure_count = 0
redis.call('SET', key, cjson.encode(cb), 'EX', 86400)
return cjson.encode(cb)
"""


class RedisCircuitBreaker:
    """
    Circuit breaker with shared state in Redis.

    Interface-compatible with the in-memory CircuitBreaker in billing_api.py
    so either can be used as a drop-in replacement.
    """

    STATE_CLOSED = 'closed'
    STATE_OPEN = 'open'
    STATE_HALF_OPEN = 'half_open'

    def __init__(
        self,
        redis_key: str = 'cb:razorpay',
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
        half_open_max_calls: int = 3,
    ):
        self._redis_key = redis_key
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._half_open_max_calls = half_open_max_calls
        self._redis = None
        self._local_state = 'closed'
        self._local_failure_count = 0

    def _get_redis(self):
        if self._redis is None:
            try:
                import redis as redis_mod
                redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
                self._redis = redis_mod.from_url(redis_url, decode_responses=True)
                self._redis.ping()
            except Exception as e:
                logger.warning(f"Redis unavailable for circuit breaker: {e}")
                self._redis = None
        return self._redis

    def can_execute(self) -> bool:
        """Check if execution is allowed. Thread-safe via Redis Lua."""
        r = self._get_redis()
        if r is None:
            return True  # Redis down → fail-open (let requests through)
        try:
            check = r.eval(
                CB_LUA_CHECK,
                1,
                self._redis_key,
                time.time(),
                self._failure_threshold,
                self._recovery_timeout,
                self._half_open_max_calls,
            )
            result = json.loads(check)
            self._local_state = result.get('state', 'closed')
            return result.get('allowed', 1) == 1
        except Exception as e:
            logger.warning(f"Circuit breaker Redis check failed: {e}")
            return True  # Fail-open

    def record_success(self):
        """Record a successful call — may transition HALF_OPEN → CLOSED."""
        r = self._get_redis()
        if r is None:
            self._local_failure_count = 0
            self._local_state = self.STATE_CLOSED
            return
        try:
            result = r.eval(
                CB_LUA_RECORD_SUCCESS,
                1,
                self._redis_key,
                self._half_open_max_calls,
            )
            decoded = json.loads(result)
            self._local_state = decoded.get('state', 'closed')
        except Exception as e:
            logger.warning(f"Circuit breaker record_success Redis error: {e}")

    def record_failure(self):
        """Record a failed call — may transition to OPEN."""
        r = self._get_redis()
        if r is None:
            self._local_failure_count += 1
            if self._local_failure_count >= self._failure_threshold:
                self._local_state = self.STATE_OPEN
            return
        try:
            result = r.eval(
                CB_LUA_RECORD_FAILURE,
                1,
                self._redis_key,
                time.time(),
                self._failure_threshold,
            )
            decoded = json.loads(result)
            self._local_state = decoded.get('state', 'closed')
        except Exception as e:
            logger.warning(f"Circuit breaker record_failure Redis error: {e}")

    @property
    def state(self) -> str:
        """Return the last known state. Updated on each can_execute/record call."""
        return self._local_state

    @property
    def failure_count(self) -> int:
        """Return the last known failure count."""
        return self._local_failure_count


def create_circuit_breaker(
    redis_key: str = 'cb:razorpay',
    failure_threshold: int = 5,
    recovery_timeout: int = 30,
    half_open_max_calls: int = 3,
):
    """
    Factory: creates RedisCircuitBreaker (shared across workers).
    RedisCircuitBreaker internally degrades to local state if Redis is unavailable.
    No flag needed — this is always the single source of truth.
    """
    logger.info("Creating Redis-backed circuit breaker (shared across workers)")
    return RedisCircuitBreaker(
        redis_key=redis_key,
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        half_open_max_calls=half_open_max_calls,
    )
