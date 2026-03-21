"""
ResponseQualityGate — Last defense before response reaches the user.

Catches generic responses when business data could answer better.
Sits AFTER the LLM response is built, BEFORE it is returned.

Architecture:
    LLM Response → check() → _is_generic() → _can_do_better() → _rebuild_response()
                                                                        ↓
                                                                  DomainAnswerer

If the LLM produced a generic reply ("contact us for pricing") but
business_data has actual prices → rebuild with DomainAnswerer.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ResponseQualityGate:
    """
    FAANG-grade response quality enforcement.
    
    Scans every outgoing response for generic signal phrases.
    If found AND business_data could provide a better answer,
    rebuilds the response using DomainAnswerer.
    
    Tracks metrics for monitoring DRR (Domain Response Rate).
    """

    # ── Generic signal phrases that should NEVER appear when data exists ──
    # If any of these appear in a response AND business_data has relevant
    # information, the response is rebuilt.
    GENERIC_SIGNALS = [
        # Pricing cop-outs
        "contact us for pricing",
        "contact us for details",
        "check with us for pricing",
        "pricing details available on request",
        # Availability cop-outs
        "our team will respond",
        "someone will get back",
        "we'll get back to you",
        "our team will assist",
        "one of our team members",
        "a team member will",
        "our team will reply",
        # Generic deflections
        "feel free to ask",
        "feel free to reach out",
        "reach out to us",
        "ask us directly",
        "check with us",
        "for more information",
        "visit us for details",
        # Error cop-outs
        "please try again",
        "i'm having trouble",
        "i apologize for the inconvenience",
        # Greeting cop-outs (when user asked a specific question)
        "thanks for reaching out",
        "thanks for your patience",
        "thank you for contacting",
        # Bare greeting used as full response (no business content)
        "how can i help you today",
        "how may i help you",
        "how can we help you",
        "what can i do for you",
        "is there anything else",
        # Scope cop-outs
        "i can only help with",
        "i'm not able to help with that",
        "that's outside my scope",
    ]

    def __init__(self):
        self._stats = {
            "total_checked": 0,
            "generic_caught": 0,
            "rebuilt": 0,
            "pass_through": 0,
        }

    def check(
        self,
        response: dict,
        message: str,
        business_data: dict,
        conversation_history: list = None,
    ) -> dict:
        """
        Main entry point — check response quality before sending to user.
        
        Logic:
          1. Scan reply text for GENERIC_SIGNALS
          2. If found AND business_data has relevant info → rebuild response
          3. If found AND no business data → log warning, pass through
          4. Track generic_response_rate metric
        
        Args:
            response: The response dict about to be sent
            message: The original user message
            business_data: Full business data dict
            conversation_history: For context resolution
            
        Returns:
            Either the same response (passes quality check) or a rebuilt response.
        """
        self._stats["total_checked"] += 1
        reply = response.get("reply", "")

        if not self._is_generic(reply):
            return response  # Clean — pass through

        # ── Generic detected ──
        self._stats["generic_caught"] += 1
        
        gen_method = response.get("metadata", {}).get("generation_method", "unknown")
        logger.warning(
            f"🚨 QualityGate CAUGHT generic response | "
            f"method={gen_method} | "
            f"reply='{reply[:80]}...' | "
            f"message='{message[:60]}'"
        )

        if self._can_do_better(message, business_data):
            rebuilt = self._rebuild_response(
                message, business_data, response, conversation_history
            )
            if rebuilt:
                self._stats["rebuilt"] += 1
                logger.info(
                    f"✅ QualityGate REBUILT response | "
                    f"new_reply='{rebuilt['reply'][:80]}...'"
                )
                return rebuilt

        # Can't do better — pass through with warning metadata
        self._stats["pass_through"] += 1
        response.setdefault("metadata", {})
        response["metadata"]["quality_gate_warning"] = True
        response["metadata"]["quality_gate_generic_detected"] = True
        logger.warning(
            f"⚠️ QualityGate: Generic detected but cannot rebuild "
            f"(no relevant business data)"
        )
        return response

    def _is_generic(self, reply: str) -> bool:
        """
        Check if reply contains any generic signal phrases.
        Case-insensitive matching.
        """
        if not reply:
            return True  # Empty reply is definitely generic
            
        reply_lower = reply.lower()
        return any(signal in reply_lower for signal in self.GENERIC_SIGNALS)

    def _can_do_better(self, message: str, business_data: dict) -> bool:
        """
        Check if business_data has enough information to answer
        this specific message better than the generic response.
        """
        from .domain_answerer import get_domain_answerer

        da = get_domain_answerer()
        return da.can_answer(message, business_data)

    def _rebuild_response(
        self,
        message: str,
        business_data: dict,
        original_response: dict,
        conversation_history: list = None,
    ) -> Optional[dict]:
        """
        Build a better response using DomainAnswerer.
        Preserves original intent classification if it was correct.
        """
        from .domain_answerer import get_domain_answerer

        da = get_domain_answerer()
        rebuilt = da.answer(message, business_data, conversation_history)

        if not rebuilt:
            return None

        # Preserve original intent if classification was meaningful
        original_intent = original_response.get("intent", "unknown")
        if original_intent not in ("unknown", "general_enquiry"):
            rebuilt["intent"] = original_intent

        # Tag metadata for tracking
        rebuilt.setdefault("metadata", {})
        rebuilt["metadata"]["quality_gate_rebuilt"] = True
        rebuilt["metadata"]["original_generation_method"] = (
            original_response.get("metadata", {}).get("generation_method", "unknown")
        )
        rebuilt["metadata"]["generation_method"] = "quality_gate_rebuilt"

        return rebuilt

    def get_stats(self) -> dict:
        """Return quality gate metrics for monitoring dashboard."""
        total = self._stats["total_checked"]
        return {
            **self._stats,
            "generic_rate": (
                round(self._stats["generic_caught"] / total, 4)
                if total else 0.0
            ),
            "rebuild_rate": (
                round(self._stats["rebuilt"] / total, 4)
                if total else 0.0
            ),
            "rebuild_success_rate": (
                round(
                    self._stats["rebuilt"] / self._stats["generic_caught"], 4
                )
                if self._stats["generic_caught"] else 0.0
            ),
        }


# ═══════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════

_quality_gate: Optional[ResponseQualityGate] = None


def get_quality_gate() -> ResponseQualityGate:
    """Get the ResponseQualityGate singleton."""
    global _quality_gate
    if _quality_gate is None:
        _quality_gate = ResponseQualityGate()
    return _quality_gate
