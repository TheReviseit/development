"""
Resilience Module for Production-Ready Error Handling.
Implements circuit breaker, retry logic, and graceful degradation.
"""

from .circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    get_circuit_breaker,
    with_circuit_breaker,
)
from .retry_handler import (
    RetryHandler,
    retry_with_backoff,
    async_retry_with_backoff,
)
from .graceful_degradation import (
    FallbackHandler,
    get_fallback_handler,
    with_fallback,
)

__all__ = [
    'CircuitBreaker',
    'CircuitState', 
    'get_circuit_breaker',
    'with_circuit_breaker',
    'RetryHandler',
    'retry_with_backoff',
    'async_retry_with_backoff',
    'FallbackHandler',
    'get_fallback_handler',
    'with_fallback',
]

