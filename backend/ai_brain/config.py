"""
Configuration for AI Brain module.
Contains LLM settings, token budgets, rate limits, and response constraints.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class TokenLimits:
    """Token budgeting configuration for LLM calls."""
    max_input_tokens: int = 2000
    max_output_tokens: int = 300
    context_window: int = 4000
    
    # Allocation strategy
    business_data_budget: int = 1200
    history_budget: int = 500
    user_message_budget: int = 200
    system_prompt_budget: int = 100


@dataclass
class ResponseLimits:
    """Response length constraints for WhatsApp-friendly messages."""
    max_chars: int = 500
    max_sentences: int = 4
    max_bullets: int = 5
    split_threshold: int = 800  # Split into multiple messages if longer


@dataclass
class RateLimits:
    """Per-business rate limiting configuration."""
    messages_per_minute: int = 20
    messages_per_hour: int = 200
    ai_calls_per_day: int = 1000


PLAN_LIMITS = {
    "starter": RateLimits(messages_per_minute=10, messages_per_hour=100, ai_calls_per_day=500),
    "growth": RateLimits(messages_per_minute=30, messages_per_hour=500, ai_calls_per_day=2000),
    "enterprise": RateLimits(messages_per_minute=100, messages_per_hour=2000, ai_calls_per_day=10000),
}


@dataclass
class LLMConfig:
    """LLM provider configuration."""
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: Optional[str] = None
    temperature: float = 0.7
    max_retries: int = 3
    timeout_seconds: int = 30
    
    def __post_init__(self):
        if self.api_key is None:
            self.api_key = os.getenv("OPENAI_API_KEY")


@dataclass
class AIBrainConfig:
    """Main configuration class for AI Brain."""
    llm: LLMConfig = field(default_factory=LLMConfig)
    tokens: TokenLimits = field(default_factory=TokenLimits)
    response: ResponseLimits = field(default_factory=ResponseLimits)
    rate_limits: RateLimits = field(default_factory=RateLimits)
    
    # Confidence thresholds for auto-reply decisions
    confidence_auto_reply: float = 0.85
    confidence_review_flag: float = 0.60
    confidence_human_approval: float = 0.40
    
    # Behavior settings
    enable_clarification_questions: bool = True
    enable_lead_capture: bool = True
    fallback_to_human: bool = True
    
    # =========================================================================
    # NEW v2.0 SETTINGS
    # =========================================================================
    
    # ChatGPT-powered features
    use_llm_intent_detection: bool = True      # Use ChatGPT for intent (vs keyword)
    enable_function_calling: bool = True       # Enable tool/function use
    enable_safety_filter: bool = True          # Run safety checks on messages
    
    # Conversation management
    conversation_history_limit: int = 10       # Max messages to keep in context
    session_timeout_seconds: int = 3600        # Session TTL (1 hour)
    
    # Caching
    enable_caching: bool = True                # Enable response caching
    cache_ttl_default: int = 300               # Default cache TTL (5 minutes)
    
    # Language support
    enable_language_detection: bool = True     # Auto-detect message language
    default_language: str = "en"               # Fallback language
    supported_languages: tuple = (
        "en", "hi", "hinglish", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa"
    )
    
    # Analytics
    enable_analytics: bool = True              # Track interactions for analytics
    store_messages_in_analytics: bool = False  # Store message content (privacy)
    
    # Rate limiting
    enable_rate_limiting: bool = True          # Enforce rate limits
    
    @classmethod
    def from_env(cls) -> "AIBrainConfig":
        """Create config from environment variables."""
        return cls(
            llm=LLMConfig(
                provider=os.getenv("AI_BRAIN_LLM_PROVIDER", "openai"),
                model=os.getenv("AI_BRAIN_LLM_MODEL", "gpt-4o-mini"),
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=float(os.getenv("AI_BRAIN_TEMPERATURE", "0.7")),
            ),
            # Feature toggles from env
            use_llm_intent_detection=os.getenv("AI_BRAIN_LLM_INTENT", "true").lower() == "true",
            enable_function_calling=os.getenv("AI_BRAIN_FUNCTION_CALLING", "true").lower() == "true",
            enable_caching=os.getenv("AI_BRAIN_CACHING", "true").lower() == "true",
            enable_analytics=os.getenv("AI_BRAIN_ANALYTICS", "true").lower() == "true",
            conversation_history_limit=int(os.getenv("AI_BRAIN_HISTORY_LIMIT", "10")),
        )
    
    def get_rate_limits_for_plan(self, plan: str) -> RateLimits:
        """Get rate limits for a subscription plan."""
        return PLAN_LIMITS.get(plan.lower(), self.rate_limits)


# Default configuration instance
default_config = AIBrainConfig.from_env()


# =============================================================================
# CONFIG VALIDATION
# =============================================================================

def validate_config(config: AIBrainConfig) -> list:
    """
    Validate configuration and return list of issues.
    
    Returns:
        List of validation error strings (empty if valid)
    """
    issues = []
    
    # Check API key
    if not config.llm.api_key:
        issues.append("OPENAI_API_KEY not set. AI features will not work.")
    
    # Check model
    valid_models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
    if config.llm.model not in valid_models:
        issues.append(f"Unknown model '{config.llm.model}'. Recommended: {valid_models}")
    
    # Check temperature
    if not 0.0 <= config.llm.temperature <= 2.0:
        issues.append(f"Temperature {config.llm.temperature} out of range [0.0, 2.0]")
    
    # Check history limit
    if config.conversation_history_limit < 1:
        issues.append("conversation_history_limit must be at least 1")
    elif config.conversation_history_limit > 50:
        issues.append("conversation_history_limit > 50 may cause high token usage")
    
    return issues
