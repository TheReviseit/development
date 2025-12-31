"""
Circuit Breaker Pattern Implementation.
Prevents cascade failures by stopping calls to failing services.
"""

import time
import logging
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
from functools import wraps

logger = logging.getLogger('reviseit.resilience')


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing, block all calls
    HALF_OPEN = "half_open" # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""
    failure_threshold: int = 5      # Failures before opening
    success_threshold: int = 2      # Successes to close from half-open
    timeout_seconds: float = 30.0   # How long to stay open
    half_open_max_calls: int = 3    # Max calls in half-open state


@dataclass
class CircuitStats:
    """Statistics for a circuit breaker."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    state_changes: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "rejected_calls": self.rejected_calls,
            "state_changes": self.state_changes,
            "success_rate": self.successful_calls / self.total_calls if self.total_calls > 0 else 0,
        }


class CircuitBreaker:
    """
    Circuit Breaker for external service calls.
    
    Usage:
        breaker = CircuitBreaker("whatsapp_api")
        
        try:
            with breaker:
                result = call_whatsapp_api()
        except CircuitOpenError:
            # Handle circuit open (use fallback)
            pass
    """
    
    def __init__(
        self,
        name: str,
        config: CircuitBreakerConfig = None,
        fallback: Callable = None
    ):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.fallback = fallback
        
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0
        
        self._lock = Lock()
        self.stats = CircuitStats()
    
    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        with self._lock:
            self._check_state_transition()
            return self._state
    
    def _check_state_transition(self):
        """Check if state should transition."""
        if self._state == CircuitState.OPEN:
            # Check if timeout has passed
            if self._last_failure_time:
                time_since_failure = time.time() - self._last_failure_time
                if time_since_failure >= self.config.timeout_seconds:
                    self._transition_to(CircuitState.HALF_OPEN)
    
    def _transition_to(self, new_state: CircuitState):
        """Transition to a new state."""
        old_state = self._state
        self._state = new_state
        self.stats.state_changes += 1
        
        logger.info(
            f"Circuit '{self.name}' state: {old_state.value} -> {new_state.value}"
        )
        
        if new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
            self._success_count = 0
        elif new_state == CircuitState.CLOSED:
            self._failure_count = 0
    
    def is_call_permitted(self) -> bool:
        """Check if a call is permitted."""
        with self._lock:
            self._check_state_transition()
            
            if self._state == CircuitState.CLOSED:
                return True
            
            if self._state == CircuitState.OPEN:
                return False
            
            # Half-open: allow limited calls
            if self._half_open_calls < self.config.half_open_max_calls:
                self._half_open_calls += 1
                return True
            
            return False
    
    def record_success(self):
        """Record a successful call."""
        with self._lock:
            self.stats.total_calls += 1
            self.stats.successful_calls += 1
            self.stats.last_success_time = time.time()
            
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.config.success_threshold:
                    self._transition_to(CircuitState.CLOSED)
            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success
                self._failure_count = max(0, self._failure_count - 1)
    
    def record_failure(self, exception: Exception = None):
        """Record a failed call."""
        with self._lock:
            self.stats.total_calls += 1
            self.stats.failed_calls += 1
            self.stats.last_failure_time = time.time()
            self._last_failure_time = time.time()
            
            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._transition_to(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                self._failure_count += 1
                if self._failure_count >= self.config.failure_threshold:
                    self._transition_to(CircuitState.OPEN)
    
    def record_rejection(self):
        """Record a rejected call (circuit open)."""
        with self._lock:
            self.stats.rejected_calls += 1
    
    def __enter__(self):
        """Context manager entry."""
        if not self.is_call_permitted():
            self.record_rejection()
            raise CircuitOpenError(
                f"Circuit '{self.name}' is open. Call rejected."
            )
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if exc_type is None:
            self.record_success()
        else:
            self.record_failure(exc_val)
        return False  # Don't suppress exceptions
    
    def reset(self):
        """Manually reset the circuit breaker."""
        with self._lock:
            self._transition_to(CircuitState.CLOSED)
            self._failure_count = 0
            self._success_count = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get circuit breaker statistics."""
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                **self.stats.to_dict(),
            }


class CircuitOpenError(Exception):
    """Raised when circuit is open and call is rejected."""
    pass


# =============================================================================
# Circuit Breaker Registry
# =============================================================================

_circuit_breakers: Dict[str, CircuitBreaker] = {}
_registry_lock = Lock()


def get_circuit_breaker(
    name: str,
    config: CircuitBreakerConfig = None,
    fallback: Callable = None
) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    with _registry_lock:
        if name not in _circuit_breakers:
            _circuit_breakers[name] = CircuitBreaker(
                name=name,
                config=config,
                fallback=fallback
            )
        return _circuit_breakers[name]


def with_circuit_breaker(
    name: str,
    fallback: Callable = None,
    config: CircuitBreakerConfig = None
):
    """
    Decorator to wrap function with circuit breaker.
    
    Usage:
        @with_circuit_breaker("whatsapp_api")
        def send_message(to, message):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            breaker = get_circuit_breaker(name, config, fallback)
            
            try:
                with breaker:
                    return func(*args, **kwargs)
            except CircuitOpenError:
                if fallback:
                    return fallback(*args, **kwargs)
                raise
        
        return wrapper
    return decorator

