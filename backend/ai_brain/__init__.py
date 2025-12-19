"""
WhatsApp AI Brain Package
Intelligent response generation for WhatsApp business chatbots.
"""

from .ai_brain import AIBrain
from .schemas import BusinessData, ConversationMessage
from .intents import IntentType, IntentDetector
from .config import AIBrainConfig

__version__ = "1.0.0"
__all__ = [
    "AIBrain",
    "BusinessData",
    "ConversationMessage",
    "IntentType",
    "IntentDetector",
    "AIBrainConfig",
]
