"""
Adaptive Backpressure Controller — FAANG Fix #2
================================================

Prevents system overload at scale (10K+ msg/sec).

Problem: Without backpressure control:
    - Celery queues grow unbounded → OOM
    - Redis memory spikes → evictions
    - DB connections exhausted → cascading failures
    - Everything collapses under load

Solution: Priority-based adaptive load shedding.

Priority Levels (NEVER shed priority 1):
    1. CRITICAL  → Inbound message storage (data preservation)
    2. HIGH      → Direct replies to humans (UX)
    3. MEDIUM    → Automation triggers (can delay)
    4. LOW       → AI responses, analytics (expensive, can defer)
    5. BACKGROUND → Token refresh, cleanup (schedule later)

Load Levels:
    NORMAL   → Accept everything
    ELEVATED → Shed background (priority 5)
    HIGH     → Only critical + high (priority ≤ 2)
    CRITICAL → Only message storage (priority 1, NEVER lose data)

Author: FlowAuxi Engineering
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from enum import Enum, IntEnum
from typing import Any, Dict, Optional

logger = logging.getLogger('flowauxi.messaging.backpressure')


class Priority(IntEnum):
    """Message processing priority levels."""
    CRITICAL = 1       # Inbound storage — NEVER shed
    HIGH = 2           # Direct human replies
    MEDIUM = 3         # Automation triggers
    LOW = 4            # AI responses, analytics
    BACKGROUND = 5     # Cleanup, token refresh


class LoadLevel(str, Enum):
    """System load levels."""
    NORMAL = "normal"
    ELEVATED = "elevated"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class BackpressureThresholds:
    """Configurable thresholds for load level detection."""
    # Celery queue depth (messages waiting)
    queue_normal: int = 1000
    queue_elevated: int = 3000
    queue_high: int = 5000
    queue_critical: int = 10000
    
    # Redis memory percentage
    redis_elevated_pct: float = 70.0
    redis_high_pct: float = 85.0
    redis_critical_pct: float = 95.0
    
    # Backend response time (ms)
    latency_elevated_ms: float = 100.0
    latency_high_ms: float = 200.0
    latency_critical_ms: float = 500.0


class BackpressureController:
    """
    Adaptive backpressure controller with priority-based load shedding.
    
    Usage:
        bp = get_backpressure_controller()
        
        # Check before dispatching to Celery
        if not bp.should_accept(Priority.MEDIUM):
            logger.warning("backpressure_shed priority=MEDIUM")
            return  # Skip automation, still store message
        
        # Get recommended delay for graceful degradation
        delay = bp.get_delay_seconds(Priority.LOW)
        if delay > 0:
            task.apply_async(countdown=delay)
        else:
            task.delay()
    """
    
    def __init__(
        self,
        redis_client=None,
        thresholds: Optional[BackpressureThresholds] = None,
    ):
        self._redis = redis_client
        self._thresholds = thresholds or BackpressureThresholds()
        
        # Cache load level (recalculate every 5 seconds max)
        self._cached_level: Optional[LoadLevel] = None
        self._cache_time: float = 0.0
        self._cache_ttl: float = 5.0  # seconds
        
        # Metrics
        self._total_accepted = 0
        self._total_shed = 0
        self._total_delayed = 0
    
    def get_load_level(self) -> LoadLevel:
        """
        Calculate current system load level.
        
        Checks multiple signals and returns the WORST level.
        Result is cached for 5 seconds to avoid Redis overhead.
        """
        now = time.monotonic()
        
        # Return cached if fresh enough
        if (
            self._cached_level is not None
            and (now - self._cache_time) < self._cache_ttl
        ):
            return self._cached_level
        
        level = LoadLevel.NORMAL
        
        # Signal 1: Celery queue depth
        queue_depth = self._get_queue_depth()
        if queue_depth >= self._thresholds.queue_critical:
            level = LoadLevel.CRITICAL
        elif queue_depth >= self._thresholds.queue_high:
            level = max(level, LoadLevel.HIGH, key=self._level_ordinal)
        elif queue_depth >= self._thresholds.queue_elevated:
            level = max(level, LoadLevel.ELEVATED, key=self._level_ordinal)
        
        # Signal 2: Redis memory (if available)
        redis_mem_pct = self._get_redis_memory_pct()
        if redis_mem_pct is not None:
            if redis_mem_pct >= self._thresholds.redis_critical_pct:
                level = LoadLevel.CRITICAL
            elif redis_mem_pct >= self._thresholds.redis_high_pct:
                level = max(level, LoadLevel.HIGH, key=self._level_ordinal)
            elif redis_mem_pct >= self._thresholds.redis_elevated_pct:
                level = max(level, LoadLevel.ELEVATED, key=self._level_ordinal)
        
        # Cache result
        self._cached_level = level
        self._cache_time = now
        
        if level != LoadLevel.NORMAL:
            logger.info(
                f"backpressure_level={level.value} "
                f"queue_depth={queue_depth} "
                f"redis_mem={redis_mem_pct or 'N/A'}"
            )
        
        return level
    
    def should_accept(self, priority: Priority) -> bool:
        """
        Check if a task with given priority should be accepted.
        
        Args:
            priority: Task priority (1=critical, 5=background)
            
        Returns:
            True if task should be accepted, False if it should be shed
        """
        level = self.get_load_level()
        
        # Priority 1 (CRITICAL) is NEVER shed — we never lose data
        if priority == Priority.CRITICAL:
            self._total_accepted += 1
            return True
        
        accepted = False
        
        if level == LoadLevel.NORMAL:
            accepted = True                          # Accept everything
        elif level == LoadLevel.ELEVATED:
            accepted = priority <= Priority.LOW      # Shed only background
        elif level == LoadLevel.HIGH:
            accepted = priority <= Priority.HIGH     # Only critical + high
        else:  # CRITICAL
            accepted = priority <= Priority.CRITICAL  # Only message storage
        
        if accepted:
            self._total_accepted += 1
        else:
            self._total_shed += 1
            logger.info(
                f"backpressure_shed priority={priority.name} "
                f"load={level.value}"
            )
        
        return accepted
    
    def get_delay_seconds(self, priority: Priority) -> float:
        """
        Get recommended delay for graceful degradation.
        
        Instead of rejecting, non-critical tasks can be delayed
        to reduce burst pressure.
        
        Args:
            priority: Task priority
            
        Returns:
            Recommended delay in seconds (0 = no delay)
        """
        level = self.get_load_level()
        
        if level == LoadLevel.NORMAL:
            return 0.0
        
        if priority == Priority.CRITICAL:
            return 0.0  # Never delay critical
        
        # Higher priority = less delay
        # Lower priority = more delay
        base_delays = {
            LoadLevel.ELEVATED: 1.0,
            LoadLevel.HIGH: 5.0,
            LoadLevel.CRITICAL: 15.0,
        }
        
        base = base_delays.get(level, 0.0)
        # Scale by priority (priority 2 = 1x, priority 5 = 4x)
        delay = base * (priority.value - 1)
        
        if delay > 0:
            self._total_delayed += 1
            logger.debug(
                f"backpressure_delay={delay:.1f}s priority={priority.name} "
                f"load={level.value}"
            )
        
        return delay
    
    def _get_queue_depth(self) -> int:
        """Get total Celery queue depth from Redis."""
        if not self._redis:
            return 0
        
        try:
            # Check all known Celery queues
            queues = [
                'celery', 'high', 'low', 'default',
                'instagram', 'ai_processing',
            ]
            total = 0
            for queue in queues:
                try:
                    depth = self._redis.llen(queue)
                    if isinstance(depth, int):
                        total += depth
                except Exception:
                    pass
            return total
        except Exception as e:
            logger.debug(f"backpressure_queue_check_error: {e}")
            return 0
    
    def _get_redis_memory_pct(self) -> Optional[float]:
        """Get Redis memory usage percentage."""
        if not self._redis:
            return None
        
        try:
            info = self._redis.info('memory')
            used = info.get('used_memory', 0)
            max_mem = info.get('maxmemory', 0)
            
            if max_mem > 0:
                return (used / max_mem) * 100.0
            return None
        except Exception:
            return None
    
    @staticmethod
    def _level_ordinal(level: LoadLevel) -> int:
        """Convert LoadLevel to ordinal for comparison."""
        order = {
            LoadLevel.NORMAL: 0,
            LoadLevel.ELEVATED: 1,
            LoadLevel.HIGH: 2,
            LoadLevel.CRITICAL: 3,
        }
        return order.get(level, 0)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get backpressure controller statistics."""
        return {
            'current_level': self.get_load_level().value,
            'total_accepted': self._total_accepted,
            'total_shed': self._total_shed,
            'total_delayed': self._total_delayed,
            'shed_rate': (
                self._total_shed / max(
                    self._total_accepted + self._total_shed, 1
                ) * 100
            ),
            'queue_depth': self._get_queue_depth(),
            'redis_memory_pct': self._get_redis_memory_pct(),
            'thresholds': {
                'queue_critical': self._thresholds.queue_critical,
                'redis_critical_pct': self._thresholds.redis_critical_pct,
            },
        }


# =============================================================================
# Singleton
# =============================================================================

_controller_instance: Optional[BackpressureController] = None


def get_backpressure_controller() -> BackpressureController:
    """Get singleton BackpressureController instance."""
    global _controller_instance
    if _controller_instance is None:
        redis_client = None
        try:
            import redis
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/1')
            redis_client = redis.from_url(
                redis_url,
                decode_responses=False,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            redis_client.ping()
        except Exception as e:
            logger.warning(f"⚠️ BackpressureController Redis unavailable: {e}")
        
        _controller_instance = BackpressureController(redis_client=redis_client)
        logger.info("⚡ BackpressureController initialized")
    
    return _controller_instance
