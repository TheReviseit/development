"""
Configuration for AI Brain module — v4.0 (Gemini).
Contains LLM settings, token budgets, rate limits, and response constraints.

v4.0 changes:
- Migrated from OpenAI (gpt-4o-mini/gpt-4o) to Google Gemini 2.5 Flash
- Single-model architecture: Gemini 2.5 Flash handles classification + generation
- ~70% cost reduction vs OpenAI
- Retry/timeout configuration
- Provider-agnostic API key resolution
"""

import os
from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class TokenLimits:
    """Token budgeting configuration for LLM calls."""
    max_input_tokens: int = 2500
    max_output_tokens: int = 500       # was 300 — allows richer responses
    context_window: int = 4000

    # Allocation strategy
    business_data_budget: int = 1200
    history_budget: int = 800          # was 500 — more memory
    user_message_budget: int = 200
    system_prompt_budget: int = 300    # was 100 — dynamic prompt is richer


@dataclass
class ResponseLimits:
    """Response length constraints for WhatsApp-friendly messages."""
    max_chars: int = 650               # was 500 — WhatsApp safe, not too heavy
    max_sentences: int = 6             # was 4
    max_bullets: int = 7               # was 5
    split_threshold: int = 1000        # was 800


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
    """LLM provider configuration — Gemini 2.5 Flash (single model)."""
    provider: str = "gemini"

    # Single model architecture: Gemini 2.5 Flash is fast AND capable
    # No need for separate classification/generation models
    classification_model: str = "gemini-2.5-flash"
    generation_model: str = "gemini-2.5-flash"

    # Legacy field — used as fallback if code references config.llm.model
    model: str = "gemini-2.5-flash"

    api_key: Optional[str] = None
    temperature: float = 0.7
    classification_temperature: float = 0.3     # Lower for deterministic classification
    max_retries: int = 3
    timeout_seconds: int = 30
    retry_base_delay: float = 1.0               # Base delay for exponential backoff (seconds)

    # 429 rate-limit resilience
    rate_limit_max_retries: int = 2             # Max retries specifically for 429 RESOURCE_EXHAUSTED
    min_request_interval_ms: int = 200          # Min milliseconds between API calls (burst prevention)

    # Confidence-based token escalation
    # When confidence < this threshold, use more tokens for better reasoning
    low_confidence_threshold: float = 0.6
    low_confidence_max_tokens: int = 700        # More tokens for uncertain queries

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


# =============================================================================
# RESPONSE STYLE ENGINE CONFIG
# =============================================================================

@dataclass
class ResponseStyleConfig:
    """Configuration for the response style engine."""
    # Token budgets per message complexity
    short_max_tokens: int = 150        # "price?" → direct answer
    medium_max_tokens: int = 350       # "Tell me about services" → structured
    long_max_tokens: int = 500         # Complex multi-part question → detailed


@dataclass
class AIBrainConfig:
    """Main configuration class for AI Brain."""
    llm: LLMConfig = field(default_factory=LLMConfig)
    tokens: TokenLimits = field(default_factory=TokenLimits)
    response: ResponseLimits = field(default_factory=ResponseLimits)
    rate_limits: RateLimits = field(default_factory=RateLimits)
    style: ResponseStyleConfig = field(default_factory=ResponseStyleConfig)

    # Confidence thresholds for auto-reply decisions
    confidence_auto_reply: float = 0.85
    confidence_review_flag: float = 0.60
    confidence_human_approval: float = 0.40

    # Behavior settings
    enable_clarification_questions: bool = True
    enable_lead_capture: bool = True
    fallback_to_human: bool = True

    # =========================================================================
    # v2.0 SETTINGS
    # =========================================================================

    # ChatGPT-powered features
    use_llm_intent_detection: bool = True
    enable_function_calling: bool = True
    enable_safety_filter: bool = True

    # Conversation management
    conversation_history_limit: int = 10
    session_timeout_seconds: int = 3600

    # Caching
    enable_caching: bool = True
    cache_ttl_default: int = 300

    # Language support
    enable_language_detection: bool = True
    default_language: str = "en"
    supported_languages: tuple = (
        "en", "hi", "hinglish", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa"
    )

    # Analytics
    enable_analytics: bool = True
    store_messages_in_analytics: bool = False

    # Rate limiting
    enable_rate_limiting: bool = True

    # =========================================================================
    # v3.0 SETTINGS
    # =========================================================================

    # Response intelligence
    enable_self_check: bool = True              # Post-generation quality check
    enable_smart_clarification: bool = True     # Ask instead of guess
    enable_response_validation: bool = True     # Validate prices/facts

    @classmethod
    def from_env(cls) -> "AIBrainConfig":
        """Create config from environment variables."""
        return cls(
            llm=LLMConfig(
                provider=os.getenv("AI_BRAIN_LLM_PROVIDER", "gemini"),
                classification_model=os.getenv("AI_BRAIN_CLASSIFICATION_MODEL", "gemini-2.5-flash"),
                generation_model=os.getenv("AI_BRAIN_GENERATION_MODEL", "gemini-2.5-flash"),
                model=os.getenv("AI_BRAIN_LLM_MODEL", "gemini-2.5-flash"),
                api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
                temperature=float(os.getenv("AI_BRAIN_TEMPERATURE", "0.7")),
            ),
            # Feature toggles from env
            use_llm_intent_detection=os.getenv("AI_BRAIN_LLM_INTENT", "true").lower() == "true",
            enable_function_calling=os.getenv("AI_BRAIN_FUNCTION_CALLING", "true").lower() == "true",
            enable_caching=os.getenv("AI_BRAIN_CACHING", "true").lower() == "true",
            enable_analytics=os.getenv("AI_BRAIN_ANALYTICS", "true").lower() == "true",
            conversation_history_limit=int(os.getenv("AI_BRAIN_HISTORY_LIMIT", "10")),
            enable_self_check=os.getenv("AI_BRAIN_SELF_CHECK", "true").lower() == "true",
            enable_smart_clarification=os.getenv("AI_BRAIN_CLARIFICATION", "true").lower() == "true",
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
    """Validate configuration and return list of issues."""
    issues = []

    if not config.llm.api_key:
        issues.append("GEMINI_API_KEY (or GOOGLE_API_KEY) not set. AI features will not work.")

    valid_models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
    if config.llm.classification_model not in valid_models:
        issues.append(f"Unknown classification model '{config.llm.classification_model}'.")
    if config.llm.generation_model not in valid_models:
        issues.append(f"Unknown generation model '{config.llm.generation_model}'.")

    if not 0.0 <= config.llm.temperature <= 2.0:
        issues.append(f"Temperature {config.llm.temperature} out of range [0.0, 2.0]")

    if config.conversation_history_limit < 1:
        issues.append("conversation_history_limit must be at least 1")
    elif config.conversation_history_limit > 50:
        issues.append("conversation_history_limit > 50 may cause high token usage")

    return issues
