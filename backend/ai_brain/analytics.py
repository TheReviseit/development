"""
Analytics and feedback tracking for AI Brain.
Enables dashboards, insights, and performance monitoring.
"""

import time
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime, timedelta
from collections import defaultdict
from threading import Lock


class ResolutionOutcome(str, Enum):
    """Outcome of an AI interaction."""
    RESOLVED = "resolved"           # AI successfully answered
    ESCALATED = "escalated"         # Handed off to human
    FAILED = "failed"              # Error or couldn't help
    PENDING = "pending"            # Awaiting user response
    ABANDONED = "abandoned"        # User left without resolution


class SatisfactionLevel(str, Enum):
    """User satisfaction indicators."""
    POSITIVE = "positive"       # 👍 or thank you
    NEUTRAL = "neutral"         # No feedback
    NEGATIVE = "negative"       # 👎 or complaint


@dataclass
class InteractionEvent:
    """A single AI interaction event."""
    event_id: str
    timestamp: float
    business_id: str
    user_id: str
    
    # Intent info
    intent: str
    confidence: float
    
    # Message info
    user_message: str
    ai_response: str
    
    # Performance
    response_time_ms: int
    tokens_used: int
    
    # Outcome
    outcome: ResolutionOutcome
    tool_called: Optional[str] = None
    
    # Metadata
    language: str = "en"
    is_cached: bool = False
    model: str = "gpt-4o-mini"


@dataclass
class BusinessAnalytics:
    """Aggregated analytics for a business."""
    business_id: str
    period_start: float
    period_end: float
    
    # Counts
    total_interactions: int = 0
    unique_users: int = 0
    
    # Intent breakdown
    intents: Dict[str, int] = field(default_factory=dict)
    
    # Outcomes
    resolved_count: int = 0
    escalated_count: int = 0
    failed_count: int = 0
    
    # Performance
    avg_response_time_ms: float = 0
    total_tokens: int = 0
    cache_hit_rate: float = 0
    
    # Quality
    avg_confidence: float = 0
    satisfaction_positive: int = 0
    satisfaction_negative: int = 0
    
    # Top queries
    top_queries: List[str] = field(default_factory=list)


class AnalyticsTracker:
    """
    Analytics and feedback tracking for AI Brain.
    
    Features:
    - Track every AI interaction
    - Aggregate by business, time period
    - Monitor performance and quality
    - Enable dashboards and insights
    """
    
    def __init__(self, db_client=None):
        """
        Initialize analytics tracker.
        
        Args:
            db_client: Optional database client for persistence
        """
        self.db = db_client
        
        # In-memory storage for non-DB mode
        self._events: List[InteractionEvent] = []
        self._business_stats: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {
                "total": 0,
                "intents": defaultdict(int),
                "outcomes": defaultdict(int),
                "tokens": 0,
                "response_times": [],
                "confidences": [],
                "users": set(),
                "cache_hits": 0,
            }
        )
        
        self._lock = Lock()
        self._max_events = 10000  # Keep last N events in memory
    
    def track_interaction(
        self,
        business_id: str,
        user_id: str,
        intent: str,
        confidence: float,
        user_message: str,
        ai_response: str,
        response_time_ms: int,
        tokens_used: int,
        outcome: ResolutionOutcome,
        tool_called: str = None,
        language: str = "en",
        is_cached: bool = False,
        model: str = "gpt-4o-mini"
    ) -> str:
        """
        Track an AI interaction.
        
        Returns:
            Event ID
        """
        event_id = f"{business_id}_{int(time.time() * 1000)}_{user_id[:8]}"
        
        event = InteractionEvent(
            event_id=event_id,
            timestamp=time.time(),
            business_id=business_id,
            user_id=user_id,
            intent=intent,
            confidence=confidence,
            user_message=user_message[:500],  # Truncate for storage
            ai_response=ai_response[:500],
            response_time_ms=response_time_ms,
            tokens_used=tokens_used,
            outcome=outcome,
            tool_called=tool_called,
            language=language,
            is_cached=is_cached,
            model=model
        )
        
        # Store in memory
        with self._lock:
            self._events.append(event)
            
            # Trim if too many events
            if len(self._events) > self._max_events:
                self._events = self._events[-self._max_events:]
            
            # Update aggregates
            stats = self._business_stats[business_id]
            stats["total"] += 1
            stats["intents"][intent] += 1
            stats["outcomes"][outcome.value] += 1
            stats["tokens"] += tokens_used
            stats["response_times"].append(response_time_ms)
            stats["confidences"].append(confidence)
            stats["users"].add(user_id)
            if is_cached:
                stats["cache_hits"] += 1
        
        # Persist to database if available
        if self.db:
            self._persist_event(event)
        
        return event_id
    
    def track_feedback(
        self,
        event_id: str,
        satisfaction: SatisfactionLevel,
        feedback_text: str = None
    ):
        """Track user feedback for an interaction."""
        with self._lock:
            # Find and update event
            for event in reversed(self._events):
                if event.event_id == event_id:
                    # Store feedback in metadata (simplified)
                    break
        
        # Persist to database if available
        if self.db:
            self._persist_feedback(event_id, satisfaction, feedback_text)
    
    def get_business_analytics(
        self,
        business_id: str,
        hours: int = 24
    ) -> BusinessAnalytics:
        """
        Get analytics for a business over a time period.
        
        Args:
            business_id: Business identifier
            hours: Look-back period in hours
            
        Returns:
            BusinessAnalytics object
        """
        cutoff = time.time() - (hours * 3600)
        
        with self._lock:
            # Filter events for this business and time period
            events = [
                e for e in self._events
                if e.business_id == business_id and e.timestamp >= cutoff
            ]
            
            if not events:
                return BusinessAnalytics(
                    business_id=business_id,
                    period_start=cutoff,
                    period_end=time.time()
                )
            
            # Aggregate stats
            intents: Dict[str, int] = defaultdict(int)
            outcomes: Dict[str, int] = defaultdict(int)
            users = set()
            response_times = []
            confidences = []
            tokens = 0
            cache_hits = 0
            queries: Dict[str, int] = defaultdict(int)
            
            for e in events:
                intents[e.intent] += 1
                outcomes[e.outcome.value] += 1
                users.add(e.user_id)
                response_times.append(e.response_time_ms)
                confidences.append(e.confidence)
                tokens += e.tokens_used
                if e.is_cached:
                    cache_hits += 1
                
                # Track query frequency (simplified)
                query_key = e.intent + ":" + e.user_message[:50]
                queries[query_key] += 1
            
            # Find top queries
            sorted_queries = sorted(queries.items(), key=lambda x: x[1], reverse=True)
            top_queries = [q[0] for q in sorted_queries[:10]]
            
            return BusinessAnalytics(
                business_id=business_id,
                period_start=cutoff,
                period_end=time.time(),
                total_interactions=len(events),
                unique_users=len(users),
                intents=dict(intents),
                resolved_count=outcomes.get("resolved", 0),
                escalated_count=outcomes.get("escalated", 0),
                failed_count=outcomes.get("failed", 0),
                avg_response_time_ms=sum(response_times) / len(response_times) if response_times else 0,
                total_tokens=tokens,
                cache_hit_rate=cache_hits / len(events) if events else 0,
                avg_confidence=sum(confidences) / len(confidences) if confidences else 0,
                top_queries=top_queries
            )
    
    def get_global_stats(self) -> Dict[str, Any]:
        """Get global statistics across all businesses."""
        with self._lock:
            total_events = len(self._events)
            total_businesses = len(self._business_stats)
            
            # Aggregate across all businesses
            total_tokens = sum(s["tokens"] for s in self._business_stats.values())
            total_users = sum(len(s["users"]) for s in self._business_stats.values())
            
            # Intent distribution
            all_intents: Dict[str, int] = defaultdict(int)
            for stats in self._business_stats.values():
                for intent, count in stats["intents"].items():
                    all_intents[intent] += count
            
            return {
                "total_events": total_events,
                "total_businesses": total_businesses,
                "total_users": total_users,
                "total_tokens": total_tokens,
                "intent_distribution": dict(all_intents)
            }
    
    def export_events(
        self,
        business_id: str = None,
        hours: int = 24
    ) -> List[Dict[str, Any]]:
        """Export events as list of dicts for external analysis."""
        cutoff = time.time() - (hours * 3600)
        
        with self._lock:
            events = [
                e for e in self._events
                if e.timestamp >= cutoff and (business_id is None or e.business_id == business_id)
            ]
            
            return [asdict(e) for e in events]
    
    def _persist_event(self, event: InteractionEvent):
        """Persist event to database."""
        # Example for Supabase:
        # self.db.table("ai_analytics").insert({
        #     "event_id": event.event_id,
        #     "timestamp": datetime.fromtimestamp(event.timestamp).isoformat(),
        #     "business_id": event.business_id,
        #     "user_id": event.user_id,
        #     "intent": event.intent,
        #     "confidence": event.confidence,
        #     "response_time_ms": event.response_time_ms,
        #     "tokens_used": event.tokens_used,
        #     "outcome": event.outcome.value,
        #     "tool_called": event.tool_called,
        #     "language": event.language,
        #     "is_cached": event.is_cached,
        #     "model": event.model
        # }).execute()
        pass
    
    def _persist_feedback(
        self,
        event_id: str,
        satisfaction: SatisfactionLevel,
        feedback_text: str
    ):
        """Persist feedback to database."""
        # self.db.table("ai_feedback").insert({
        #     "event_id": event_id,
        #     "satisfaction": satisfaction.value,
        #     "feedback_text": feedback_text,
        #     "created_at": "now()"
        # }).execute()
        pass


# =============================================================================
# RATE LIMITING
# =============================================================================

class RateLimiter:
    """
    Rate limiter for AI calls per business.
    
    Tracks usage and enforces limits based on subscription plan.
    """
    
    PLAN_LIMITS = {
        "starter": {"per_minute": 10, "per_hour": 100, "per_day": 500},
        "growth": {"per_minute": 30, "per_hour": 500, "per_day": 2000},
        "enterprise": {"per_minute": 100, "per_hour": 2000, "per_day": 10000},
    }
    
    def __init__(self):
        self._usage: Dict[str, Dict[str, List[float]]] = defaultdict(
            lambda: {"minute": [], "hour": [], "day": []}
        )
        self._lock = Lock()
    
    def check_limit(self, business_id: str, plan: str = "starter") -> bool:
        """
        Check if business is within rate limits.
        
        Returns:
            True if allowed, False if rate limited
        """
        limits = self.PLAN_LIMITS.get(plan, self.PLAN_LIMITS["starter"])
        now = time.time()
        
        with self._lock:
            usage = self._usage[business_id]
            
            # Clean old entries and count recent
            minute_cutoff = now - 60
            hour_cutoff = now - 3600
            day_cutoff = now - 86400
            
            usage["minute"] = [t for t in usage["minute"] if t > minute_cutoff]
            usage["hour"] = [t for t in usage["hour"] if t > hour_cutoff]
            usage["day"] = [t for t in usage["day"] if t > day_cutoff]
            
            # Check limits
            if len(usage["minute"]) >= limits["per_minute"]:
                return False
            if len(usage["hour"]) >= limits["per_hour"]:
                return False
            if len(usage["day"]) >= limits["per_day"]:
                return False
            
            return True
    
    def record_usage(self, business_id: str):
        """Record an AI call for rate limiting."""
        now = time.time()
        
        with self._lock:
            usage = self._usage[business_id]
            usage["minute"].append(now)
            usage["hour"].append(now)
            usage["day"].append(now)
    
    def get_remaining(self, business_id: str, plan: str = "starter") -> Dict[str, int]:
        """Get remaining calls for each time window."""
        limits = self.PLAN_LIMITS.get(plan, self.PLAN_LIMITS["starter"])
        
        with self._lock:
            usage = self._usage.get(business_id, {"minute": [], "hour": [], "day": []})
            
            now = time.time()
            minute_usage = len([t for t in usage["minute"] if t > now - 60])
            hour_usage = len([t for t in usage["hour"] if t > now - 3600])
            day_usage = len([t for t in usage["day"] if t > now - 86400])
            
            return {
                "per_minute": max(0, limits["per_minute"] - minute_usage),
                "per_hour": max(0, limits["per_hour"] - hour_usage),
                "per_day": max(0, limits["per_day"] - day_usage)
            }


# =============================================================================
# SINGLETON INSTANCES
# =============================================================================

_analytics_tracker: Optional[AnalyticsTracker] = None
_rate_limiter: Optional[RateLimiter] = None


def get_analytics_tracker(db_client=None) -> AnalyticsTracker:
    """Get the global analytics tracker."""
    global _analytics_tracker
    if _analytics_tracker is None:
        _analytics_tracker = AnalyticsTracker(db_client)
    return _analytics_tracker


def get_rate_limiter() -> RateLimiter:
    """Get the global rate limiter."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter
