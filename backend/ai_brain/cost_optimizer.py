"""
Cost Optimizer for AI Brain v2.0.
Implements smart routing, caching, and token optimization strategies
to reduce OpenAI API costs by 50-80%.
"""

import re
import hashlib
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from .intents import IntentType


class ModelTier(str, Enum):
    """Model tiers for cost optimization."""
    MINI = "gpt-4o-mini"        # Cheapest, fastest
    STANDARD = "gpt-4o"         # High quality
    PREMIUM = "gpt-4-turbo"     # Best quality


class QueryComplexity(str, Enum):
    """Query complexity levels."""
    TRIVIAL = "trivial"         # No LLM needed (hardcoded reply)
    SIMPLE = "simple"           # Use mini model, no history
    MEDIUM = "medium"           # Use mini model, some history
    COMPLEX = "complex"         # Use standard model, full history


@dataclass
class CostDecision:
    """Decision on how to process a query for cost optimization."""
    skip_llm: bool                     # If True, use hardcoded reply
    hardcoded_reply: Optional[str]     # Pre-defined reply if skipping LLM
    model: str                         # Model to use
    history_depth: int                 # How many history messages to include
    use_cache: bool                    # Whether to try cache first
    cache_ttl: int                     # Cache TTL in seconds
    use_retrieval: bool                # Whether to use smart retrieval
    estimated_tokens: int              # Estimated input tokens
    complexity: QueryComplexity        # Query complexity level


# =============================================================================
# STRATEGY #8: HARDCODED REPLIES FOR UNIVERSAL INTENTS
# =============================================================================

# Universal patterns that don't need LLM
HARDCODED_PATTERNS = {
    # Greetings - high frequency, no context needed
    "greeting": {
        "patterns": [
            r"^(hi|hello|hey|hii+|hola|namaste|namaskar)[\s!.?]*$",
            r"^good\s+(morning|afternoon|evening|night)[\s!.?]*$",
            r"^(sup|yo|hiya)[\s!.?]*$",
        ],
        "replies": [
            "Hello! 👋 How can I help you today?",
            "Hi there! 😊 What can I do for you?",
            "Namaste! 🙏 How may I assist you?",
        ],
        "ttl": 3600,
    },
    
    # Thank you - no processing needed
    "thank_you": {
        "patterns": [
            r"^(thanks?|thank\s*you|thx|thnx|ty|thanku|dhanyawad|shukriya)[\s!.]*$",
            r"^(thanks?\s+(a lot|so much|very much))[\s!.]*$",
            r"^(appreciated?|great|awesome|nice)[\s!.]*$",
        ],
        "replies": [
            "You're welcome! 😊 Is there anything else I can help with?",
            "Happy to help! 🙏 Let me know if you need anything else.",
            "My pleasure! Feel free to ask if you have more questions. ✨",
        ],
        "ttl": 3600,
    },
    
    # Goodbye - end conversation
    "goodbye": {
        "patterns": [
            r"^(bye|goodbye|bye\s*bye|tata|cya|see\s*you|alvida)[\s!.]*$",
            r"^(ok\s*bye|alright\s*bye|that'?s\s*all)[\s!.]*$",
            r"^(good\s*night|take\s*care)[\s!.]*$",
        ],
        "replies": [
            "Goodbye! 👋 Have a great day!",
            "Take care! 😊 Come back anytime.",
            "Bye! 🙏 We're here whenever you need us.",
        ],
        "ttl": 3600,
    },
    
    # Simple confirmations
    "confirmation": {
        "patterns": [
            r"^(ok|okay|k|kk|okie|alright|sure|fine|got\s*it)[\s!.]*$",
            r"^(yes|yeah|yep|yup|yea|haan|ji|ha)[\s!.]*$",
            r"^(no|nope|nah|nahi|nahin)[\s!.]*$",
            r"^(hmm+|oh|ah|i\s*see)[\s!.]*$",
        ],
        "replies": [
            "Great! 👍 Is there anything else I can help with?",
            "Got it! Let me know if you need anything else. 😊",
            "Alright! Feel free to ask any other questions.",
        ],
        "ttl": 1800,
    },
    
    # Emoji-only messages
    "emoji_only": {
        "patterns": [
            r"^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251\s]+$",
        ],
        "replies": [
            "😊 How can I help you today?",
            "👋 What would you like to know?",
        ],
        "ttl": 1800,
    },
}


def check_hardcoded_reply(message: str) -> Optional[Tuple[str, str, int]]:
    """
    Check if message matches a hardcoded pattern.
    
    Returns:
        Tuple of (intent, reply, cache_ttl) or None if no match
    """
    message_clean = message.strip().lower()
    
    for intent, config in HARDCODED_PATTERNS.items():
        for pattern in config["patterns"]:
            if re.match(pattern, message_clean, re.IGNORECASE):
                # Rotate through replies for variety
                import random
                reply = random.choice(config["replies"])
                return intent, reply, config["ttl"]
    
    return None


# =============================================================================
# STRATEGY #2: TIERED MODEL ROUTING
# =============================================================================

# Intent to model tier mapping
INTENT_MODEL_MAP = {
    # Trivial - use hardcoded (checked before this)
    IntentType.GREETING: ModelTier.MINI,
    IntentType.THANK_YOU: ModelTier.MINI,
    IntentType.GOODBYE: ModelTier.MINI,
    
    # Simple - fast model is fine
    IntentType.PRICING: ModelTier.MINI,
    IntentType.HOURS: ModelTier.MINI,
    IntentType.LOCATION: ModelTier.MINI,
    IntentType.BOOKING: ModelTier.MINI,
    
    # Medium - may need better reasoning
    IntentType.GENERAL_ENQUIRY: ModelTier.MINI,
    IntentType.LEAD_CAPTURE: ModelTier.MINI,
    IntentType.ORDER_STATUS: ModelTier.MINI,
    
    # Complex - use better model
    IntentType.COMPLAINT: ModelTier.STANDARD,
    IntentType.UNKNOWN: ModelTier.STANDARD,
}


def get_model_for_intent(intent: IntentType, confidence: float) -> str:
    """Get optimal model based on intent and confidence."""
    
    # Low confidence always uses better model
    if confidence < 0.5:
        return ModelTier.STANDARD.value
    
    # Get mapped model
    model = INTENT_MODEL_MAP.get(intent, ModelTier.MINI)
    return model.value


# =============================================================================
# STRATEGY #5: SMART HISTORY TRIMMING
# =============================================================================

def get_history_depth(
    intent: IntentType,
    confidence: float,
    is_followup: bool = False
) -> int:
    """
    Determine how much history to include based on context.
    
    High confidence simple queries: 0 messages
    Medium confidence: 2-3 messages
    Low confidence or complex: 5-10 messages
    """
    
    # Follow-ups need some history
    if is_followup:
        return 3
    
    # High confidence simple queries - no history needed
    if confidence >= 0.85:
        if intent in [
            IntentType.GREETING, IntentType.THANK_YOU, IntentType.GOODBYE,
            IntentType.HOURS, IntentType.LOCATION
        ]:
            return 0
        return 2
    
    # Medium confidence - some history
    if confidence >= 0.6:
        return 3
    
    # Low confidence - more context needed
    if confidence >= 0.4:
        return 5
    
    # Very low - maximum context
    return 10


# =============================================================================
# STRATEGY #6: FOLLOW-UP DETECTION (SKIP RECLASSIFICATION)
# =============================================================================

FOLLOWUP_PATTERNS = [
    r"^(ok|okay|yes|yeah|sure|alright|fine|haan|ji)[\s,!.]*",
    r"^(book|confirm|proceed|go ahead|do it)[\s,!.]*",
    r"^(same|that one|this one|first one|second one)[\s!.]*$",
    r"^(for\s+)?(today|tomorrow|next\s+\w+)[\s!.]*$",
    r"^(\d{1,2}[:/]\d{2}|\d{1,2}\s*(am|pm))[\s!.]*$",  # Time patterns
    r"^(\d{1,2}[/-]\d{1,2}[/-]?\d{0,4})[\s!.]*$",       # Date patterns
    r"^(my name is|i am|call me)\s+\w+",                # Name response
    r"^(\+?\d{10,15})$",                                 # Phone number
]


def is_followup_message(
    message: str,
    last_intent: Optional[str],
    last_message: Optional[str]
) -> bool:
    """
    Detect if message is a follow-up to previous interaction.
    
    If True, we can skip intent classification and reuse context.
    """
    if not last_intent:
        return False
    
    message_clean = message.strip().lower()
    
    # Check follow-up patterns
    for pattern in FOLLOWUP_PATTERNS:
        if re.match(pattern, message_clean, re.IGNORECASE):
            return True
    
    # Very short messages after booking/lead context are follow-ups
    if last_intent in ["booking", "lead_capture"]:
        words = message_clean.split()
        if len(words) <= 3:
            return True
    
    return False


# =============================================================================
# STRATEGY #1: SMART CACHE KEY GENERATION
# =============================================================================

def generate_cache_key(
    business_id: str,
    intent: str,
    message: str,
    entities: Dict[str, Any] = None
) -> str:
    """
    Generate a smart cache key that maximizes hit rate.
    
    Normalizes messages to increase cache hits for similar queries.
    """
    # Normalize message
    normalized = message.lower().strip()
    
    # Remove common variations
    normalized = re.sub(r'[?!.,]+$', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Remove filler words for better matching
    filler_words = ['please', 'kindly', 'can you', 'could you', 'tell me', 'what is', 'what are']
    for filler in filler_words:
        normalized = normalized.replace(filler, '')
    normalized = normalized.strip()
    
    # Include key entities
    entity_str = ""
    if entities:
        # Only include non-empty entities
        key_entities = {k: v for k, v in sorted(entities.items()) if v}
        if key_entities:
            entity_str = str(key_entities)
    
    # Create hash
    content = f"{normalized}:{entity_str}"
    content_hash = hashlib.md5(content.encode()).hexdigest()[:10]
    
    return f"{business_id}:{intent}:{content_hash}"


# =============================================================================
# STRATEGY #9: PLAN-BASED TOKEN BUDGETS
# =============================================================================

PLAN_BUDGETS = {
    "free": {
        "calls_per_day": 30,
        "history_depth": 2,
        "model": ModelTier.MINI.value,
        "max_input_tokens": 1000,
        "max_output_tokens": 150,
        "enable_retrieval": False,
    },
    "starter": {
        "calls_per_day": 300,
        "history_depth": 5,
        "model": ModelTier.MINI.value,
        "max_input_tokens": 1500,
        "max_output_tokens": 200,
        "enable_retrieval": False,
    },
    "growth": {
        "calls_per_day": 1000,
        "history_depth": 10,
        "model": ModelTier.MINI.value,  # With fallback to standard
        "max_input_tokens": 2000,
        "max_output_tokens": 300,
        "enable_retrieval": True,
    },
    "enterprise": {
        "calls_per_day": -1,  # Unlimited
        "history_depth": 20,
        "model": ModelTier.STANDARD.value,
        "max_input_tokens": 4000,
        "max_output_tokens": 500,
        "enable_retrieval": True,
    },
}


def get_plan_budget(plan: str) -> Dict[str, Any]:
    """Get token budget for a plan."""
    return PLAN_BUDGETS.get(plan.lower(), PLAN_BUDGETS["starter"])


# =============================================================================
# MAIN COST OPTIMIZER CLASS
# =============================================================================

class CostOptimizer:
    """
    Orchestrates all cost optimization strategies.
    
    Reduces API costs by:
    1. Hardcoded replies for universal intents (20-40% savings)
    2. Smart caching with normalized keys (40-70% savings)
    3. Tiered model routing (20-40% savings)
    4. Dynamic history trimming (5-30% savings)
    5. Follow-up detection to skip reclassification (10-20% savings)
    6. Plan-based token budgets
    """
    
    def __init__(self, default_plan: str = "starter"):
        self.default_plan = default_plan
        self._compiled_followup_patterns = [
            re.compile(p, re.IGNORECASE) for p in FOLLOWUP_PATTERNS
        ]
    
    def analyze_query(
        self,
        message: str,
        business_id: str,
        intent: Optional[IntentType] = None,
        confidence: float = 0.5,
        last_intent: Optional[str] = None,
        last_message: Optional[str] = None,
        plan: str = None
    ) -> CostDecision:
        """
        Analyze a query and return the optimal cost decision.
        
        Args:
            message: User's message
            business_id: Business identifier
            intent: Pre-detected intent (if available)
            confidence: Intent confidence
            last_intent: Previous intent in conversation
            last_message: Previous message in conversation
            plan: Business subscription plan
            
        Returns:
            CostDecision with all optimization parameters
        """
        plan = plan or self.default_plan
        budget = get_plan_budget(plan)
        
        # Strategy #8: Check for hardcoded reply first
        hardcoded = check_hardcoded_reply(message)
        if hardcoded:
            return CostDecision(
                skip_llm=True,
                hardcoded_reply=hardcoded[1],
                model=budget["model"],
                history_depth=0,
                use_cache=True,
                cache_ttl=hardcoded[2],
                use_retrieval=False,
                estimated_tokens=0,
                complexity=QueryComplexity.TRIVIAL
            )
        
        # Strategy #6: Check if follow-up (skip reclassification)
        is_followup = is_followup_message(message, last_intent, last_message)
        
        # If no intent provided, we need to classify
        # For follow-ups, we'll reuse context in the engine
        
        # Strategy #2: Determine model
        if intent:
            model = get_model_for_intent(intent, confidence)
        else:
            model = budget["model"]
        
        # Strategy #5: Determine history depth
        if intent:
            history_depth = get_history_depth(intent, confidence, is_followup)
        else:
            # Unknown intent - use moderate history
            history_depth = min(5, budget["history_depth"])
        
        # Cap by plan
        history_depth = min(history_depth, budget["history_depth"])
        
        # Determine complexity
        if intent in [IntentType.GREETING, IntentType.THANK_YOU, IntentType.GOODBYE]:
            complexity = QueryComplexity.SIMPLE
        elif intent in [IntentType.COMPLAINT, IntentType.UNKNOWN] or confidence < 0.5:
            complexity = QueryComplexity.COMPLEX
        else:
            complexity = QueryComplexity.MEDIUM
        
        # Cache TTL based on intent
        cache_ttl = self._get_cache_ttl(intent)
        
        # Estimate tokens
        estimated_tokens = self._estimate_tokens(
            message, history_depth, budget["max_input_tokens"]
        )
        
        return CostDecision(
            skip_llm=False,
            hardcoded_reply=None,
            model=model,
            history_depth=history_depth,
            use_cache=cache_ttl > 0,
            cache_ttl=cache_ttl,
            use_retrieval=budget["enable_retrieval"],
            estimated_tokens=estimated_tokens,
            complexity=complexity
        )
    
    def _get_cache_ttl(self, intent: Optional[IntentType]) -> int:
        """Get cache TTL for an intent."""
        if not intent:
            return 300  # 5 min default
        
        ttls = {
            IntentType.GREETING: 3600,
            IntentType.THANK_YOU: 3600,
            IntentType.GOODBYE: 3600,
            IntentType.HOURS: 1800,
            IntentType.LOCATION: 1800,
            IntentType.PRICING: 600,
            IntentType.GENERAL_ENQUIRY: 600,
            IntentType.BOOKING: 60,  # Short - availability changes
            IntentType.ORDER_STATUS: 0,  # No cache
            IntentType.COMPLAINT: 0,  # No cache
            IntentType.LEAD_CAPTURE: 0,  # No cache
        }
        return ttls.get(intent, 300)
    
    def _estimate_tokens(
        self,
        message: str,
        history_depth: int,
        max_tokens: int
    ) -> int:
        """Estimate input token usage."""
        # Rough estimation: 4 chars = 1 token
        message_tokens = len(message) // 4
        history_tokens = history_depth * 50  # ~50 tokens per message
        system_tokens = 300  # System prompt base
        
        return min(message_tokens + history_tokens + system_tokens, max_tokens)
    
    def should_skip_classification(
        self,
        message: str,
        last_intent: Optional[str],
        last_message: Optional[str]
    ) -> bool:
        """
        Determine if we can skip intent classification.
        
        Returns True for:
        - Hardcoded patterns (greetings, thanks, etc.)
        - Follow-up messages to previous intent
        """
        # Check hardcoded
        if check_hardcoded_reply(message):
            return True
        
        # Check follow-up
        return is_followup_message(message, last_intent, last_message)
    
    def get_savings_estimate(self, stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        Estimate cost savings based on analytics.
        
        Args:
            stats: Analytics data with intent distribution, cache hits, etc.
            
        Returns:
            Estimated savings breakdown
        """
        total_queries = stats.get("total_interactions", 0)
        if total_queries == 0:
            return {"estimated_savings": 0}
        
        # Calculate savings from each strategy
        cache_hits = stats.get("cache_hit_rate", 0)
        
        # Estimate hardcoded ratio (greetings + thanks + bye typically 15-25%)
        intents = stats.get("intents", {})
        trivial_count = (
            intents.get("greeting", 0) +
            intents.get("thank_you", 0) +
            intents.get("goodbye", 0)
        )
        trivial_ratio = trivial_count / total_queries if total_queries > 0 else 0
        
        # Estimate savings
        cache_savings = cache_hits * 0.7  # 70% savings from cache
        hardcoded_savings = trivial_ratio * 0.25  # 25% of trivial skips LLM
        
        total_savings = cache_savings + hardcoded_savings
        
        return {
            "total_queries": total_queries,
            "cache_hit_rate": cache_hits,
            "trivial_query_rate": trivial_ratio,
            "estimated_savings_percent": min(total_savings * 100, 80),
            "strategies_applied": {
                "caching": cache_savings * 100,
                "hardcoded_replies": hardcoded_savings * 100,
            }
        }


# =============================================================================
# SINGLETON
# =============================================================================

_cost_optimizer: Optional[CostOptimizer] = None


def get_cost_optimizer(default_plan: str = "starter") -> CostOptimizer:
    """Get the global cost optimizer."""
    global _cost_optimizer
    if _cost_optimizer is None:
        _cost_optimizer = CostOptimizer(default_plan)
    return _cost_optimizer
