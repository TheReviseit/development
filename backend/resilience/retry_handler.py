"""
Retry Handler with Exponential Backoff.
Implements intelligent retry logic for transient failures.
"""

import time
import random
import logging
from typing import Callable, Tuple, Type, Optional, Any
from functools import wraps
from dataclasses import dataclass

logger = logging.getLogger('reviseit.resilience')


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    base_delay: float = 1.0       # Initial delay in seconds
    max_delay: float = 60.0       # Maximum delay cap
    exponential_base: float = 2.0  # Exponential backoff base
    jitter: bool = True           # Add randomness to prevent thundering herd
    
    # Exceptions to retry on (empty = all exceptions)
    retryable_exceptions: Tuple[Type[Exception], ...] = (
        ConnectionError,
        TimeoutError,
        IOError,
    )
    
    # Exceptions to NOT retry on
    non_retryable_exceptions: Tuple[Type[Exception], ...] = (
        ValueError,
        TypeError,
        KeyError,
    )


class RetryHandler:
    """
    Retry handler with exponential backoff and jitter.
    
    Usage:
        handler = RetryHandler()
        result = handler.execute(my_function, arg1, arg2, kwarg1=value)
    """
    
    def __init__(self, config: RetryConfig = None):
        self.config = config or RetryConfig()
    
    def _should_retry(self, exception: Exception) -> bool:
        """Determine if exception is retryable."""
        # Check non-retryable first
        if isinstance(exception, self.config.non_retryable_exceptions):
            return False
        
        # If retryable_exceptions is empty, retry all (except non-retryable)
        if not self.config.retryable_exceptions:
            return True
        
        return isinstance(exception, self.config.retryable_exceptions)
    
    def _calculate_delay(self, attempt: int) -> float:
        """Calculate delay for next retry with exponential backoff."""
        delay = self.config.base_delay * (
            self.config.exponential_base ** attempt
        )
        
        # Cap at max delay
        delay = min(delay, self.config.max_delay)
        
        # Add jitter (±25%)
        if self.config.jitter:
            jitter_range = delay * 0.25
            delay += random.uniform(-jitter_range, jitter_range)
        
        return max(0, delay)
    
    def execute(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute function with retry logic.
        
        Args:
            func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
        
        Returns:
            Function result
        
        Raises:
            Last exception if all retries fail
        """
        last_exception = None
        
        for attempt in range(self.config.max_retries + 1):
            try:
                return func(*args, **kwargs)
            
            except Exception as e:
                last_exception = e
                
                if not self._should_retry(e):
                    logger.warning(
                        f"Non-retryable error in {func.__name__}: {e}"
                    )
                    raise
                
                if attempt >= self.config.max_retries:
                    logger.error(
                        f"All {self.config.max_retries} retries failed "
                        f"for {func.__name__}: {e}"
                    )
                    raise
                
                delay = self._calculate_delay(attempt)
                logger.warning(
                    f"Retry {attempt + 1}/{self.config.max_retries} "
                    f"for {func.__name__} after {delay:.2f}s: {e}"
                )
                time.sleep(delay)
        
        raise last_exception


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,),
):
    """
    Decorator for retry with exponential backoff.
    
    Usage:
        @retry_with_backoff(max_retries=3)
        def call_external_api():
            ...
    """
    config = RetryConfig(
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        exponential_base=exponential_base,
        jitter=jitter,
        retryable_exceptions=retryable_exceptions,
    )
    handler = RetryHandler(config)
    
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return handler.execute(func, *args, **kwargs)
        return wrapper
    return decorator


async def async_retry_with_backoff(
    func: Callable,
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    **kwargs
) -> Any:
    """
    Async version of retry with backoff.
    
    Usage:
        result = await async_retry_with_backoff(
            async_function, arg1, arg2, max_retries=3
        )
    """
    import asyncio
    
    last_exception = None
    
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        
        except Exception as e:
            last_exception = e
            
            if attempt >= max_retries:
                raise
            
            # Calculate delay with jitter
            delay = base_delay * (2 ** attempt)
            delay = min(delay, max_delay)
            delay += random.uniform(0, delay * 0.25)
            
            logger.warning(
                f"Async retry {attempt + 1}/{max_retries} "
                f"for {func.__name__} after {delay:.2f}s: {e}"
            )
            await asyncio.sleep(delay)
    
    raise last_exception


# =============================================================================
# Tenacity Integration (if available)
# =============================================================================

try:
    from tenacity import (
        retry,
        stop_after_attempt,
        wait_exponential,
        retry_if_exception_type,
        before_sleep_log,
    )
    TENACITY_AVAILABLE = True
    
    def tenacity_retry(
        max_retries: int = 3,
        min_delay: float = 1.0,
        max_delay: float = 60.0,
    ):
        """
        Decorator using tenacity library for more robust retry logic.
        
        Usage:
            @tenacity_retry(max_retries=3)
            def call_api():
                ...
        """
        return retry(
            stop=stop_after_attempt(max_retries + 1),
            wait=wait_exponential(multiplier=min_delay, max=max_delay),
            retry=retry_if_exception_type((ConnectionError, TimeoutError)),
            before_sleep=before_sleep_log(logger, logging.WARNING),
        )

except ImportError:
    TENACITY_AVAILABLE = False
    tenacity_retry = None

