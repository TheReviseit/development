"""
Circuit Breaker Registry — FAANG Fix #5
========================================

Production-grade circuit breaker pattern for ALL external services.

The existing NotificationService has a circuit breaker for WhatsApp,
but it's per-instance and not reusable. This module provides a
centralized, configurable registry that wraps ANY external call.

Applies to:
- Instagram Graph API
- WhatsApp Cloud API
- AI Brain (Gemini/GPT)
- Supabase (Database)
- Redis (Cache)

States:
    CLOSED  → Normal operation, requests pass through
    OPEN    → Too many failures, requests rejected immediately (fail-fast)
    HALF_OPEN → Recovery probe, limited requests allowed

Thread-safe via threading.Lock per breaker instance.

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, Optional, Tuple, TypeVar, ParamSpec

logger = logging.getLogger('flowauxi.messaging.circuit_breaker')

P = TypeVar('P')
R = TypeVar('R')


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"          # Healthy — requests pass through
    OPEN = "open"              # Failing — requests rejected
    HALF_OPEN = "half_open"    # Probing — limited requests allowed


@dataclass
class CircuitBreakerConfig:
    """
    Configuration for a circuit breaker instance.
    
    Attributes:
        failure_threshold: Consecutive failures before CLOSED → OPEN
        recovery_timeout: Seconds before OPEN → HALF_OPEN
        success_threshold: Consecutive successes in HALF_OPEN before → CLOSED
        excluded_exceptions: Exceptions that don't count as failures
                            (e.g., validation errors, 400s)
    """
    failure_threshold: int = 5
    recovery_timeout: int = 60
    success_threshold: int = 2
    excluded_exceptions: Tuple[type, ...] = ()
    
    # Monitoring
    emit_metrics: bool = True
    
    def __post_init__(self):
        if self.failure_threshold < 1:
            raise ValueError("failure_threshold must be >= 1")
        if self.recovery_timeout < 1:
            raise ValueError("recovery_timeout must be >= 1")
        if self.success_threshold < 1:
            raise ValueError("success_threshold must be >= 1")


class CircuitBreaker:
    """
    Thread-safe circuit breaker with state machine.
    
    Usage:
        cb = CircuitBreaker("instagram_api", CircuitBreakerConfig(
            failure_threshold=5,
            recovery_timeout=60,
        ))
        
        if not cb.can_execute():
            raise CircuitBreakerOpenError("instagram_api")
        
        try:
            result = instagram_api.send(...)
            cb.record_success()
        except Exception as e:
            cb.record_failure()
            raise
    
    Or use the decorator:
        @with_circuit_breaker("instagram_api")
        def send_ig_message(...):
            ...
    """
    
    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None  # monotonic
        self._last_failure_error: Optional[str] = None
        self._total_requests = 0
        self._total_failures = 0
        self._total_rejections = 0
        self._lock = threading.Lock()
        self._created_at = time.time()
    
    @property
    def state(self) -> CircuitState:
        """Get current state, auto-transitioning OPEN → HALF_OPEN if timeout elapsed."""
        with self._lock:
            if (
                self._state == CircuitState.OPEN
                and self._last_failure_time is not None
            ):
                elapsed = time.monotonic() - self._last_failure_time
                if elapsed >= self.config.recovery_timeout:
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info(
                        f"🔄 circuit={self.name} OPEN → HALF_OPEN "
                        f"after {elapsed:.0f}s"
                    )
            return self._state
    
    def can_execute(self) -> bool:
        """Check if a request can proceed through the circuit."""
        state = self.state  # Triggers auto-transition
        
        if state == CircuitState.CLOSED:
            return True
        
        if state == CircuitState.HALF_OPEN:
            return True  # Allow probe requests
        
        # OPEN — reject immediately
        with self._lock:
            self._total_rejections += 1
        
        return False
    
    def record_success(self) -> None:
        """Record a successful request."""
        with self._lock:
            self._total_requests += 1
            self._failure_count = 0
            
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.config.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._success_count = 0
                    logger.info(
                        f"✅ circuit={self.name} HALF_OPEN → CLOSED "
                        f"(recovered)"
                    )
    
    def record_failure(self, error: Optional[Exception] = None) -> None:
        """
        Record a failed request.
        
        If the exception is in excluded_exceptions, it does NOT count
        as a failure (e.g., 400 Bad Request is a client error, not
        a service failure).
        """
        # Check if this exception is excluded
        if error and self.config.excluded_exceptions:
            if isinstance(error, self.config.excluded_exceptions):
                logger.debug(
                    f"circuit={self.name} excluded_exception "
                    f"type={type(error).__name__}"
                )
                return
        
        with self._lock:
            self._total_requests += 1
            self._total_failures += 1
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            self._last_failure_error = str(error)[:200] if error else None
            
            if self._state == CircuitState.HALF_OPEN:
                # Any failure in HALF_OPEN → back to OPEN
                self._state = CircuitState.OPEN
                logger.warning(
                    f"⚠️ circuit={self.name} HALF_OPEN → OPEN "
                    f"(probe failed: {self._last_failure_error})"
                )
            
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self.config.failure_threshold:
                    self._state = CircuitState.OPEN
                    logger.error(
                        f"🔴 circuit={self.name} CLOSED → OPEN "
                        f"(failures={self._failure_count}, "
                        f"threshold={self.config.failure_threshold})"
                    )
    
    def force_open(self) -> None:
        """Manually force circuit to OPEN state (admin action)."""
        with self._lock:
            self._state = CircuitState.OPEN
            self._last_failure_time = time.monotonic()
            logger.warning(f"🔴 circuit={self.name} FORCE_OPEN (manual)")
    
    def force_close(self) -> None:
        """Manually force circuit to CLOSED state (admin action)."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            logger.info(f"✅ circuit={self.name} FORCE_CLOSED (manual)")
    
    def is_open(self) -> bool:
        """Check if circuit is in OPEN state."""
        return self.state == CircuitState.OPEN
    
    def get_stats(self) -> Dict[str, Any]:
        """Get circuit breaker statistics for monitoring."""
        with self._lock:
            return {
                'name': self.name,
                'state': self._state.value,
                'failure_count': self._failure_count,
                'success_count': self._success_count,
                'total_requests': self._total_requests,
                'total_failures': self._total_failures,
                'total_rejections': self._total_rejections,
                'last_failure_error': self._last_failure_error,
                'config': {
                    'failure_threshold': self.config.failure_threshold,
                    'recovery_timeout': self.config.recovery_timeout,
                    'success_threshold': self.config.success_threshold,
                },
                'uptime_seconds': time.time() - self._created_at,
            }


# =============================================================================
# Circuit Breaker Registry — Centralized management
# =============================================================================

class CircuitBreakerRegistry:
    """
    Centralized registry for all circuit breakers.
    
    Pre-configured for all external services used by FlowAuxi.
    Provides a single health report endpoint for monitoring.
    
    Usage:
        cb = CircuitBreakerRegistry.get("instagram_api")
        if not cb.can_execute():
            raise CircuitBreakerOpenError("instagram_api")
    """
    
    _breakers: Dict[str, CircuitBreaker] = {}
    _lock = threading.Lock()
    
    # Pre-configured service profiles
    CONFIGS = {
        # Instagram — moderate tolerance, 1 min recovery
        'instagram_api': CircuitBreakerConfig(
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=2,
        ),
        # WhatsApp — same as Instagram (both Meta APIs)
        'whatsapp_api': CircuitBreakerConfig(
            failure_threshold=5,
            recovery_timeout=60,
            success_threshold=2,
        ),
        # AI Brain — stricter (expensive, slow)
        'ai_brain': CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=120,
            success_threshold=3,
        ),
        # Per-tenant AI — even stricter
        'ai_tenant': CircuitBreakerConfig(
            failure_threshold=2,
            recovery_timeout=180,
            success_threshold=2,
        ),
        # Supabase — high tolerance (core dependency)
        'supabase': CircuitBreakerConfig(
            failure_threshold=10,
            recovery_timeout=30,
            success_threshold=2,
        ),
        # Redis — very fast recovery (also core)
        'redis': CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=15,
            success_threshold=1,
        ),
        # Meta token exchange — generous recovery
        'meta_oauth': CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=300,
            success_threshold=1,
        ),
    }
    
    @classmethod
    def get(cls, service_name: str) -> CircuitBreaker:
        """
        Get or create a circuit breaker for a service.
        
        If a pre-configured profile exists, uses those settings.
        Otherwise creates a breaker with default settings.
        
        For per-tenant breakers, use format: "ai_tenant:firebase_uid"
        """
        with cls._lock:
            if service_name not in cls._breakers:
                # Check for profile prefix (e.g., "ai_tenant:user123")
                profile = service_name.split(':')[0]
                config = cls.CONFIGS.get(
                    profile, CircuitBreakerConfig()
                )
                cls._breakers[service_name] = CircuitBreaker(
                    service_name, config
                )
                logger.debug(
                    f"circuit_created name={service_name} "
                    f"profile={profile}"
                )
            return cls._breakers[service_name]
    
    @classmethod
    def health_report(cls) -> Dict[str, Any]:
        """
        Get health report for all circuit breakers.
        
        Returns dict suitable for /health endpoint or Prometheus export.
        """
        with cls._lock:
            report = {}
            open_count = 0
            
            for name, breaker in cls._breakers.items():
                stats = breaker.get_stats()
                report[name] = stats
                if stats['state'] == CircuitState.OPEN.value:
                    open_count += 1
            
            return {
                'breakers': report,
                'total': len(cls._breakers),
                'open_count': open_count,
                'healthy': open_count == 0,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
    
    @classmethod
    def reset(cls, service_name: str) -> bool:
        """Force-close a specific circuit breaker (admin action)."""
        with cls._lock:
            if service_name in cls._breakers:
                cls._breakers[service_name].force_close()
                return True
            return False
    
    @classmethod
    def reset_all(cls) -> int:
        """Force-close ALL circuit breakers (emergency action)."""
        with cls._lock:
            count = 0
            for breaker in cls._breakers.values():
                breaker.force_close()
                count += 1
            logger.warning(f"🚨 ALL circuit breakers force-closed ({count})")
            return count


# =============================================================================
# Decorator — Wrap any function with circuit breaker protection
# =============================================================================

def with_circuit_breaker(service_name: str):
    """
    Decorator to wrap any function with circuit breaker protection.
    
    Usage:
        @with_circuit_breaker('instagram_api')
        def send_ig_message(recipient_id, text, access_token):
            response = requests.post(...)
            return response.json()
    
    When circuit is OPEN, raises CircuitBreakerOpenError immediately
    (fail-fast) without calling the wrapped function.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            from .base import CircuitBreakerOpenError
            
            cb = CircuitBreakerRegistry.get(service_name)
            
            if not cb.can_execute():
                logger.warning(
                    f"circuit_reject service={service_name} "
                    f"func={func.__name__}"
                )
                raise CircuitBreakerOpenError(service_name)
            
            try:
                result = func(*args, **kwargs)
                cb.record_success()
                return result
            except Exception as e:
                cb.record_failure(e)
                raise
        
        return wrapper
    return decorator
