"""
WhatsApp AI Brain Package v4.0 (Gemini)
Intelligent response generation for WhatsApp business chatbots.

Features:
- Google Gemini 2.5 Flash powered (single-model, ~70% cheaper than OpenAI)
- Dynamic 6-layer prompt builder with AI personality
- Function calling for actionable intents
- Conversation context management with LLM summarization
- Redis-backed user profiles with key fact extraction
- Response caching with language-aware keys
- Multi-language support with style matching
- Smart clarification, self-check, and response validation
- SSE streaming with human pause simulation
- Cost optimization (50-80% savings)
- Retry with exponential backoff + timeout protection
"""

from .ai_brain import AIBrain, generate_reply
from .schemas import BusinessData, ConversationMessage, GenerateReplyResponse
from .intents import IntentType, IntentDetector
from .config import AIBrainConfig, default_config, validate_config

# v2.0 Components
from .chatgpt_engine import ChatGPTEngine, IntentResult, GenerationResult
from .gemini_client import RateLimitError
from .conversation_manager import (
    ConversationManager, 
    get_conversation_manager,
    ConversationState,
    FlowStatus
)
from .response_cache import ResponseCache, get_response_cache
from .whatsapp_formatter import WhatsAppFormatter, format_for_whatsapp
from .language_detector import LanguageDetector, detect_language, Language
from .analytics import (
    AnalyticsTracker, 
    get_analytics_tracker,
    RateLimiter,
    get_rate_limiter,
    ResolutionOutcome
)
from .tools import ToolExecutor, ToolResult, get_tool_schemas
from .prompts import get_industry_tone, get_response_generator_prompt

# v3.0 Components
from .personality import PERSONALITY_PROMPT, get_language_style_prompt
from .memory_manager import AdvancedMemoryManager, get_memory_manager
from .streaming import stream_ai_response

# Cost optimization modules
from .cost_optimizer import (
    CostOptimizer,
    get_cost_optimizer,
    CostDecision,
    check_hardcoded_reply
)
from .business_retriever import (
    BusinessRetriever,
    get_retriever,
    RetrievalResult
)


__version__ = "3.0.0"
__all__ = [
    # Core
    "AIBrain",
    "generate_reply",
    
    # Schemas
    "BusinessData",
    "ConversationMessage",
    "GenerateReplyResponse",
    
    # Intents
    "IntentType",
    "IntentDetector",
    
    # Config
    "AIBrainConfig",
    "default_config",
    "validate_config",
    
    # v2.0 Components
    "ChatGPTEngine",
    "IntentResult",
    "GenerationResult",
    "ConversationManager",
    "get_conversation_manager",
    "ResponseCache",
    "get_response_cache",
    "WhatsAppFormatter",
    "format_for_whatsapp",
    "LanguageDetector",
    "detect_language",
    "Language",
    "AnalyticsTracker",
    "get_analytics_tracker",
    "RateLimiter",
    "get_rate_limiter",
    "ResolutionOutcome",
    "ToolExecutor",
    "ToolResult",
    "get_tool_schemas",
    
    # Cost optimization
    "CostOptimizer",
    "get_cost_optimizer",
    "CostDecision",
    "check_hardcoded_reply",
    "BusinessRetriever",
    "get_retriever",
    "RetrievalResult",

    # v3.0 Components
    "PERSONALITY_PROMPT",
    "get_language_style_prompt",
    "AdvancedMemoryManager",
    "get_memory_manager",
    "stream_ai_response",
]

