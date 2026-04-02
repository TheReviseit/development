"""
AI Brain Rate Governor — FAANG Fix #4
======================================

Controls AI usage per tenant to prevent:
- Cost explosion (AI is most expensive component)
- Latency spikes (AI is slowest component)
- Cascading failures (AI timeout → queue buildup)

Features:
- Per-tenant hourly request rate limits (sliding window)
- Per-tenant daily token budgets
- Per-tenant circuit breakers
- Plan-based limit tiers
- Separate Celery queue for AI tasks (lower priority than messaging)
- Graceful fallback when limits exceeded

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from .circuit_breaker import CircuitBreakerRegistry

logger = logging.getLogger('flowauxi.messaging.ai_governor')


class AIGovernor:
    """
    Per-tenant AI request governance.
    
    Controls:
    1. Hourly request rate (sliding window in Redis)
    2. Daily token budget (accumulated counter in Redis)
    3. Per-tenant circuit breaker (via CircuitBreakerRegistry)
    
    Usage:
        gov = get_ai_governor()
        
        allowed, reason = gov.can_use_ai(tenant_id="uid123", plan="business")
        if not allowed:
            # Use fallback: rule-based reply or "We'll get back to you"
            return fallback_response(reason)
        
        # Proceed with AI
        response, tokens = ai_brain.generate(...)
        gov.record_usage(tenant_id="uid123", tokens_used=tokens)
    """
    
    # Plan-based limits
    PLAN_LIMITS = {
        'free': {
            'requests_per_hour': 20,
            'tokens_per_day': 10_000,
        },
        'starter': {
            'requests_per_hour': 50,
            'tokens_per_day': 50_000,
        },
        'business': {
            'requests_per_hour': 200,
            'tokens_per_day': 200_000,
        },
        'pro': {
            'requests_per_hour': 1000,
            'tokens_per_day': 1_000_000,
        },
        'enterprise': {
            'requests_per_hour': 5000,
            'tokens_per_day': 10_000_000,
        },
    }
    
    # Dedicated Celery queue for AI tasks
    AI_QUEUE = "ai_processing"
    
    def __init__(self, redis_client):
        """
        Args:
            redis_client: Redis connection for rate counters
        """
        self._redis = redis_client
    
    def can_use_ai(
        self,
        tenant_id: str,
        plan: str = 'starter',
    ) -> Tuple[bool, str]:
        """
        Check if a tenant can make an AI request.
        
        Checks in order:
        1. Circuit breaker (per-tenant, prevents hammering failed AI)
        2. Hourly rate limit (sliding window)
        3. Daily token budget
        
        Args:
            tenant_id: Firebase UID of the business
            plan: Subscription plan name
            
        Returns:
            Tuple of (allowed: bool, reason: str)
            reason is 'ok' if allowed, or a specific reason if denied
        """
        limits = self.PLAN_LIMITS.get(plan, self.PLAN_LIMITS['starter'])
        
        # ─── Check 1: Per-tenant circuit breaker ───
        cb = CircuitBreakerRegistry.get(f"ai_tenant:{tenant_id}")
        if cb.is_open():
            logger.info(
                f"ai_gov_denied tenant={tenant_id[:15]} "
                f"reason=circuit_breaker_open"
            )
            return False, "circuit_breaker_open"
        
        # ─── Check 2: Hourly rate limit (sliding window) ───
        now = datetime.now(timezone.utc)
        hour_key = (
            f"ai_rate:{tenant_id}:{now.strftime('%Y%m%d%H')}"
        )
        
        try:
            current = self._redis.incr(hour_key)
            if current == 1:
                self._redis.expire(hour_key, 3600)  # 1h TTL
            
            if current > limits['requests_per_hour']:
                # Undo the increment
                self._redis.decr(hour_key)
                logger.info(
                    f"ai_gov_denied tenant={tenant_id[:15]} "
                    f"reason=hourly_limit "
                    f"current={current}/{limits['requests_per_hour']}"
                )
                return False, "hourly_limit_exceeded"
        except Exception as e:
            # Redis failure — allow request (fail open)
            logger.warning(f"ai_gov_redis_error hourly: {e}")
        
        # ─── Check 3: Daily token budget ───
        day_key = (
            f"ai_tokens:{tenant_id}:{now.strftime('%Y%m%d')}"
        )
        
        try:
            used_tokens = self._redis.get(day_key)
            used = int(used_tokens) if used_tokens else 0
            
            if used > limits['tokens_per_day']:
                logger.info(
                    f"ai_gov_denied tenant={tenant_id[:15]} "
                    f"reason=daily_token_budget "
                    f"used={used}/{limits['tokens_per_day']}"
                )
                return False, "daily_token_budget_exceeded"
        except Exception as e:
            logger.warning(f"ai_gov_redis_error tokens: {e}")
        
        return True, "ok"
    
    def record_usage(
        self,
        tenant_id: str,
        tokens_used: int,
        model: str = 'unknown',
        latency_ms: float = 0.0,
    ) -> None:
        """
        Record AI usage for a tenant (post-request).
        
        Args:
            tenant_id: Firebase UID
            tokens_used: Number of tokens consumed
            model: AI model used ('gemini', 'gpt-4', etc.)
            latency_ms: Request latency in milliseconds
        """
        now = datetime.now(timezone.utc)
        day_key = f"ai_tokens:{tenant_id}:{now.strftime('%Y%m%d')}"
        
        try:
            self._redis.incrby(day_key, tokens_used)
            # Set TTL only if key is new (don't reset existing TTL)
            ttl = self._redis.ttl(day_key)
            if ttl is None or ttl < 0:
                self._redis.expire(day_key, 86400)
            
            logger.debug(
                f"ai_usage tenant={tenant_id[:15]} "
                f"tokens={tokens_used} model={model} "
                f"latency={latency_ms:.0f}ms"
            )
        except Exception as e:
            logger.warning(f"ai_gov_record_error: {e}")
    
    def record_failure(self, tenant_id: str, error: Exception) -> None:
        """Record an AI failure for the per-tenant circuit breaker."""
        cb = CircuitBreakerRegistry.get(f"ai_tenant:{tenant_id}")
        cb.record_failure(error)
    
    def record_success(self, tenant_id: str) -> None:
        """Record an AI success for the per-tenant circuit breaker."""
        cb = CircuitBreakerRegistry.get(f"ai_tenant:{tenant_id}")
        cb.record_success()
    
    def get_usage_stats(self, tenant_id: str) -> Dict[str, Any]:
        """Get current AI usage stats for a tenant (for dashboard)."""
        now = datetime.now(timezone.utc)
        
        hour_key = f"ai_rate:{tenant_id}:{now.strftime('%Y%m%d%H')}"
        day_key = f"ai_tokens:{tenant_id}:{now.strftime('%Y%m%d')}"
        
        try:
            hourly_requests = int(self._redis.get(hour_key) or 0)
            daily_tokens = int(self._redis.get(day_key) or 0)
        except Exception:
            hourly_requests = -1
            daily_tokens = -1
        
        cb = CircuitBreakerRegistry.get(f"ai_tenant:{tenant_id}")
        
        return {
            'hourly_requests': hourly_requests,
            'daily_tokens': daily_tokens,
            'circuit_breaker': cb.get_stats(),
        }
    
    def get_fallback_message(self, reason: str) -> str:
        """
        Get user-friendly fallback message when AI is unavailable.
        
        Used as automated response when AI limits are exceeded.
        """
        messages = {
            'circuit_breaker_open': (
                "Thanks for your message! Our AI assistant is temporarily "
                "unavailable. A team member will get back to you shortly."
            ),
            'hourly_limit_exceeded': (
                "Thanks for your message! We've received a high volume of "
                "messages. A team member will respond soon."
            ),
            'daily_token_budget_exceeded': (
                "Thanks for reaching out! Our automated responses have "
                "reached their daily limit. We'll reply manually soon."
            ),
        }
        return messages.get(
            reason,
            "Thanks for your message! We'll get back to you shortly."
        )


# =============================================================================
# Singleton
# =============================================================================

_governor_instance: Optional[AIGovernor] = None


def get_ai_governor() -> AIGovernor:
    """Get singleton AIGovernor instance."""
    global _governor_instance
    if _governor_instance is None:
        try:
            import redis
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
            redis_client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
                max_connections=5,
            )
            redis_client.ping()
            _governor_instance = AIGovernor(redis_client=redis_client)
            logger.info("🧠 AIGovernor initialized")
        except Exception as e:
            logger.error(f"❌ AIGovernor init failed: {e}")
            raise
    return _governor_instance
