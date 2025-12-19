"""
WhatsApp AI Brain Package v2.0
Intelligent response generation for WhatsApp business chatbots.

Features:
- ChatGPT-powered intent classification
- Function calling for actionable intents
- Conversation context management
- Response caching
- Multi-language support
- Analytics tracking
- Cost optimization (50-80% savings)
"""

from .ai_brain import AIBrain, generate_reply
from .schemas import BusinessData, ConversationMessage, GenerateReplyResponse
from .intents import IntentType, IntentDetector
from .config import AIBrainConfig, default_config, validate_config

# v2.0 Components
from .chatgpt_engine import ChatGPTEngine, IntentResult, GenerationResult
from .conversation_manager import ConversationManager, get_conversation_manager
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


__version__ = "2.0.0"
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
]

