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
    
    @classmethod
    def from_env(cls) -> "AIBrainConfig":
        """Create config from environment variables."""
        return cls(
            llm=LLMConfig(
                provider=os.getenv("AI_BRAIN_LLM_PROVIDER", "openai"),
                model=os.getenv("AI_BRAIN_LLM_MODEL", "gpt-4o-mini"),
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=float(os.getenv("AI_BRAIN_TEMPERATURE", "0.7")),
            )
        )
    
    def get_rate_limits_for_plan(self, plan: str) -> RateLimits:
        """Get rate limits for a subscription plan."""
        return PLAN_LIMITS.get(plan.lower(), self.rate_limits)


# Default configuration instance
default_config = AIBrainConfig.from_env()
