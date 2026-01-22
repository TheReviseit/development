"""
LLM Usage Tracker for ReviseIt - Fast In-Memory Cache.
Manages per-business token budgets with O(1) lookups.
"""

import time
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from threading import Lock

logger = logging.getLogger('reviseit.usage')


@dataclass
class UsageStatus:
    """Fast usage check result."""
    can_use: bool
    tokens_used: int
    tokens_limit: int
    replies_used: int
    replies_limit: int
    reason: Optional[str] = None


# SaaS Plans - No free tier (Starter = ₹1,499)
# GPT-4o mini pricing: Input $0.15/1M, Output $0.60/1M
# Average tokens per reply: ~1600 (input + output combined)
# Exchange rate: 1 USD = ₹89.58

PLANS = {
    "starter": {
        "monthly_llm_token_limit": 1_600_000,     # 1.6M tokens for ~1000 replies
        "max_llm_replies_per_month": 1000,
        "monthly_price_inr": 1,
        # Detailed token breakdown
        "input_token_limit": 1_000_000,
        "output_token_limit": 600_000,
        # Cost estimates (GPT-4o mini @ ₹89.58/USD)
        "avg_cost_per_reply_inr": 0.036,
        "estimated_monthly_llm_cost_inr": 36,
        # Rate limits
        "rate_limit_per_minute": 10,
        "rate_limit_per_hour": 100,
        # Features
        "conversation_history_limit": 5,
        "cache_ttl_seconds": 300,
    },
    "growth": {
        "monthly_llm_token_limit": 4_800_000,     # 4.8M tokens for ~3000 replies
        "max_llm_replies_per_month": 3000,
        "monthly_price_inr": 2999,
        "input_token_limit": 3_000_000,
        "output_token_limit": 1_800_000,
        "avg_cost_per_reply_inr": 0.036,
        "estimated_monthly_llm_cost_inr": 108,
        "rate_limit_per_minute": 30,
        "rate_limit_per_hour": 500,
        "conversation_history_limit": 10,
        "cache_ttl_seconds": 600,
    },
    "pro": {
        "monthly_llm_token_limit": 12_800_000,    # 12.8M tokens for ~8000 replies
        "max_llm_replies_per_month": 8000,
        "monthly_price_inr": 5999,
        "input_token_limit": 8_000_000,
        "output_token_limit": 4_800_000,
        "avg_cost_per_reply_inr": 0.036,
        "estimated_monthly_llm_cost_inr": 288,
        "rate_limit_per_minute": 100,
        "rate_limit_per_hour": 2000,
        "conversation_history_limit": 20,
        "cache_ttl_seconds": 900,
    }
}

# Default if no plan set
DEFAULT_PLAN = "starter"

# Realistic average tokens per reply (system prompt + business context + user msg + response)
AVG_TOKENS_PER_REPLY = 1600

# Cost calculation constants (GPT-4o mini)
INPUT_COST_PER_1M_USD = 0.15      # $0.15 per 1M input tokens
OUTPUT_COST_PER_1M_USD = 0.60     # $0.60 per 1M output tokens
CACHED_COST_PER_1M_USD = 0.075    # $0.075 per 1M cached tokens
USD_TO_INR = 89.58                # Current exchange rate


@dataclass
class BusinessUsage:
    """In-memory usage cache for a business with cost tracking."""
    tokens_used: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0  # Cached input tokens (50% cheaper)
    replies_used: int = 0
    cycle_start: float = field(default_factory=time.time)
    cycle_end: float = field(default_factory=lambda: time.time() + 30*24*3600)
    plan_id: str = "starter"
    last_sync: float = 0  # Last DB sync timestamp
    
    # Cost tracking
    cost_usd: float = 0.0
    cost_inr: float = 0.0
    
    def calculate_cost(self) -> float:
        """
        Calculate LLM cost based on token usage.
        GPT-4o mini: Input $0.15/1M, Output $0.60/1M, Cached $0.075/1M
        Returns cost in INR.
        """
        input_cost = (self.input_tokens / 1_000_000) * INPUT_COST_PER_1M_USD
        output_cost = (self.output_tokens / 1_000_000) * OUTPUT_COST_PER_1M_USD
        cached_cost = (self.cached_tokens / 1_000_000) * CACHED_COST_PER_1M_USD
        
        self.cost_usd = round(input_cost + output_cost + cached_cost, 4)
        self.cost_inr = round(self.cost_usd * USD_TO_INR, 2)
        return self.cost_inr


@dataclass
class RetryQueueItem:
    """Message queued for retry after rate limit."""
    business_id: str
    user_id: str
    message: str
    attempt: int = 0
    created_at: float = field(default_factory=time.time)


class LLMUsageTracker:
    """
    Fast in-memory usage tracker with lazy DB sync.
    
    Uses hash map for O(1) lookups, syncs to DB periodically.
    """
    
    def __init__(self, supabase_client=None, sync_interval: int = 60):
        self.client = supabase_client
        self.sync_interval = sync_interval  # Sync to DB every N seconds
        
        # In-memory cache: business_id -> BusinessUsage
        self._cache: Dict[str, BusinessUsage] = {}
        self._lock = Lock()
        self._dirty: set = set()  # Business IDs needing DB sync
        
        # Retry queue for rate-limited messages
        self._retry_queue: List[RetryQueueItem] = []
        self._max_retries = 3
        self._retry_delay = 5  # seconds
    
    def can_use_llm(self, business_id: str, plan_id: str = None) -> UsageStatus:
        """
        O(1) check if business can use LLM.
        
        Returns instantly from cache, no DB call.
        """
        usage = self._get_or_create(business_id, plan_id)
        plan = PLANS.get(usage.plan_id, PLANS[DEFAULT_PLAN])
        
        # Check if cycle reset needed
        now = time.time()
        if now >= usage.cycle_end:
            self._reset_cycle(business_id, usage)
        
        # Fast limit checks
        tokens_limit = plan["monthly_llm_token_limit"]
        replies_limit = plan["max_llm_replies_per_month"]
        
        tokens_ok = (usage.tokens_used + AVG_TOKENS_PER_REPLY) <= tokens_limit
        replies_ok = usage.replies_used < replies_limit
        
        can_use = tokens_ok and replies_ok
        reason = None
        if not tokens_ok:
            reason = "Token limit reached"
        elif not replies_ok:
            reason = "Reply limit reached"
        
        return UsageStatus(
            can_use=can_use,
            tokens_used=usage.tokens_used,
            tokens_limit=tokens_limit,
            replies_used=usage.replies_used,
            replies_limit=replies_limit,
            reason=reason
        )
    
    def track_usage(
        self, 
        business_id: str, 
        input_tokens: int, 
        output_tokens: int
    ) -> Dict[str, int]:
        """
        O(1) usage tracking. Updates cache, lazy DB sync.
        Now includes alert thresholds at 80% and 100%.
        """
        with self._lock:
            usage = self._get_or_create(business_id)
            usage.tokens_used += input_tokens + output_tokens
            usage.input_tokens += input_tokens
            usage.output_tokens += output_tokens
            usage.replies_used += 1
            self._dirty.add(business_id)
        
        # Check alert thresholds
        plan = PLANS.get(usage.plan_id, PLANS[DEFAULT_PLAN])
        percent = (usage.tokens_used / plan["monthly_llm_token_limit"]) * 100
        if percent >= 100:
            logger.critical(f"🚨 {business_id} EXCEEDED monthly LLM limit!")
        elif percent >= 80:
            logger.warning(f"⚠️ {business_id} at {percent:.1f}% of monthly limit")
        
        # Background sync if interval passed
        if time.time() - usage.last_sync > self.sync_interval:
            self._sync_to_db(business_id)
        
        # Calculate cost after updating tokens
        usage.calculate_cost()
        
        return {
            "tokens_used": usage.tokens_used,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "replies_used": usage.replies_used,
            "usage_percent": round(percent, 1),
            "cost_usd": usage.cost_usd,
            "cost_inr": usage.cost_inr
        }
    
    def get_usage(self, business_id: str) -> Dict[str, Any]:
        """Get current usage for dashboard with cost breakdown."""
        usage = self._get_or_create(business_id)
        plan = PLANS.get(usage.plan_id, PLANS[DEFAULT_PLAN])
        
        # Calculate current cost
        usage.calculate_cost()
        
        return {
            "tokens_used": usage.tokens_used,
            "tokens_limit": plan["monthly_llm_token_limit"],
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cached_tokens": usage.cached_tokens,
            "replies_used": usage.replies_used,
            "replies_limit": plan["max_llm_replies_per_month"],
            "tokens_percent": round(usage.tokens_used / plan["monthly_llm_token_limit"] * 100, 1),
            "replies_percent": round(usage.replies_used / plan["max_llm_replies_per_month"] * 100, 1),
            "plan": usage.plan_id,
            "plan_price_inr": plan["monthly_price_inr"],
            # Cost tracking
            "cost_usd": usage.cost_usd,
            "cost_inr": usage.cost_inr,
            "budgeted_cost_inr": plan["estimated_monthly_llm_cost_inr"],
            # Profitability
            "profit_inr": round(plan["monthly_price_inr"] - usage.cost_inr, 2),
            "profit_margin_percent": round(
                ((plan["monthly_price_inr"] - usage.cost_inr) / plan["monthly_price_inr"]) * 100, 1
            ) if plan["monthly_price_inr"] > 0 else 0
        }
    
    def _get_or_create(self, business_id: str, plan_id: str = None) -> BusinessUsage:
        """Get from cache or create new entry."""
        if business_id not in self._cache:
            # Try load from DB first
            usage = self._load_from_db(business_id)
            if usage:
                self._cache[business_id] = usage
            else:
                self._cache[business_id] = BusinessUsage(
                    plan_id=plan_id or DEFAULT_PLAN
                )
        return self._cache[business_id]
    
    def _reset_cycle(self, business_id: str, usage: BusinessUsage):
        """Reset monthly billing cycle."""
        now = time.time()
        usage.tokens_used = 0
        usage.input_tokens = 0
        usage.output_tokens = 0
        usage.replies_used = 0
        usage.cycle_start = now
        usage.cycle_end = now + 30 * 24 * 3600
        self._dirty.add(business_id)
    
    def _load_from_db(self, business_id: str) -> Optional[BusinessUsage]:
        """Load usage from Supabase (called once per business)."""
        if not self.client:
            return None
        
        try:
            # Use limit(1) instead of maybe_single() for safer handling
            result = self.client.table('business_llm_usage').select('*').eq(
                'business_id', business_id
            ).limit(1).execute()
            
            # result.data is a list - check if not empty
            if result and result.data and len(result.data) > 0:
                d = result.data[0]
                return BusinessUsage(
                    tokens_used=d.get('monthly_tokens_used', 0),
                    input_tokens=0,  # Not stored in DB, track in memory only
                    output_tokens=0,  # Not stored in DB, track in memory only
                    replies_used=d.get('monthly_llm_replies', 0),
                    cycle_start=datetime.fromisoformat(d['billing_cycle_start'].replace('Z', '+00:00')).timestamp() if d.get('billing_cycle_start') else time.time(),
                    cycle_end=datetime.fromisoformat(d['billing_cycle_end'].replace('Z', '+00:00')).timestamp() if d.get('billing_cycle_end') else time.time() + 30*24*3600,
                    plan_id=DEFAULT_PLAN,
                    last_sync=time.time()
                )
        except Exception as e:
            print(f"⚠️ Could not load usage for {business_id}: {e}")
        return None
    
    def _sync_to_db(self, business_id: str, model_name: str = None):
        """Sync usage to Supabase (background, non-blocking)."""
        if not self.client or business_id not in self._cache:
            return
        
        usage = self._cache[business_id]
        try:
            # Calculate cost before syncing
            usage.calculate_cost()
            
            # Sync all fields including token breakdown
            self.client.table('business_llm_usage').upsert({
                'business_id': business_id,
                'monthly_tokens_used': usage.tokens_used,
                'monthly_llm_replies': usage.replies_used,
                'billing_cycle_start': datetime.fromtimestamp(usage.cycle_start).isoformat(),
                'billing_cycle_end': datetime.fromtimestamp(usage.cycle_end).isoformat(),
                # New fields for accurate dashboard/billing
                'input_tokens': usage.input_tokens,
                'output_tokens': usage.output_tokens,
                'cached_tokens': usage.cached_tokens,
                'cost_usd': usage.cost_usd,
                'cost_inr': usage.cost_inr,
                'model_name': model_name or 'gpt-4o-mini'
            }, on_conflict='business_id').execute()
            
            usage.last_sync = time.time()
            self._dirty.discard(business_id)
        except Exception as e:
            print(f"⚠️ Could not sync usage for {business_id}: {e}")
    
    def flush_all(self):
        """Sync all dirty entries to DB (call on shutdown)."""
        for business_id in list(self._dirty):
            self._sync_to_db(business_id)
    
    # =========================================================================
    # RETRY QUEUE MANAGEMENT
    # =========================================================================
    
    def queue_for_retry(self, business_id: str, user_id: str, message: str):
        """Queue a message for retry after rate limit hit."""
        item = RetryQueueItem(
            business_id=business_id,
            user_id=user_id,
            message=message
        )
        self._retry_queue.append(item)
        logger.info(f"📋 Queued message for retry: {business_id}")
    
    def get_retry_items(self) -> List[RetryQueueItem]:
        """Get items ready for retry (waited long enough, not exhausted)."""
        now = time.time()
        ready = [
            q for q in self._retry_queue 
            if now - q.created_at > self._retry_delay and q.attempt < self._max_retries
        ]
        return ready
    
    def remove_from_queue(self, item: RetryQueueItem):
        """Remove an item from the retry queue."""
        if item in self._retry_queue:
            self._retry_queue.remove(item)
    
    def get_queue_size(self) -> int:
        """Get current retry queue size for monitoring."""
        return len(self._retry_queue)



# Singleton instance
_tracker: Optional[LLMUsageTracker] = None


def get_usage_tracker(supabase_client=None) -> LLMUsageTracker:
    """Get global usage tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = LLMUsageTracker(supabase_client)
    return _tracker
