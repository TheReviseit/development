"""FAQ and business-knowledge answering for voice turns."""

from __future__ import annotations

import re
from typing import Any

from ..contracts.knowledge import KnowledgeAnswer
from ..domain.entities import BusinessKnowledge


class FAQAnswerService:
    """Cheap first-pass responder that reuses existing AI Brain modules."""

    def answer(
        self,
        message: str,
        knowledge: BusinessKnowledge,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> KnowledgeAnswer | None:
        message = (message or "").strip()
        if not message or not knowledge.has_data:
            return None

        local = self._try_local_responder(message, knowledge.raw_data)
        if local:
            return local

        domain = self._try_domain_answerer(message, knowledge.raw_data, conversation_history or [])
        if domain:
            return domain

        faq = self._match_faq(message, knowledge.raw_data)
        if faq:
            return faq

        hours = self._answer_hours(message, knowledge.raw_data)
        if hours:
            return hours

        services = self._answer_services(message, knowledge.raw_data)
        if services:
            return services

        return None

    def _try_local_responder(self, message: str, business_data: dict[str, Any]) -> KnowledgeAnswer | None:
        try:
            from ai_brain.local_responder import get_local_responder

            response = get_local_responder().try_trivial_response(message, business_data)
        except Exception:
            response = None
        if not response:
            return None
        return KnowledgeAnswer(
            text=self._voice_clean(response.get("reply") or response.get("text") or ""),
            source=response.get("intent") or "local_trivial",
            confidence=float(response.get("confidence") or 0.95),
            metadata={"generation_method": response.get("metadata", {}).get("generation_method", "local_responder")},
        )

    def _try_domain_answerer(
        self,
        message: str,
        business_data: dict[str, Any],
        conversation_history: list[dict[str, Any]],
    ) -> KnowledgeAnswer | None:
        try:
            from ai_brain.domain_answerer import get_domain_answerer

            response = get_domain_answerer().answer(message, business_data, conversation_history)
        except Exception:
            response = None
        if not response:
            return None
        return KnowledgeAnswer(
            text=self._voice_clean(response.get("reply") or ""),
            source=response.get("intent") or "domain_answerer",
            confidence=float(response.get("confidence") or 0.9),
            metadata=response.get("metadata") or {},
        )

    def _match_faq(self, message: str, business_data: dict[str, Any]) -> KnowledgeAnswer | None:
        faqs = business_data.get("faqs") or []
        if not isinstance(faqs, list):
            return None

        query_tokens = _tokens(message)
        best: tuple[float, str] | None = None
        for item in faqs:
            if not isinstance(item, dict):
                continue
            question = item.get("question") or item.get("q") or item.get("title") or ""
            answer = item.get("answer") or item.get("a") or item.get("content") or ""
            if not question or not answer:
                continue
            score = max(
                _overlap(query_tokens, _tokens(question)),
                _overlap(query_tokens, _tokens(f"{question} {answer}")),
            )
            if score >= 0.30 and (best is None or score > best[0]):
                best = (score, self._voice_clean(str(answer)))
        if not best:
            return None
        return KnowledgeAnswer(text=best[1], source="faq_match", confidence=best[0])

    def _answer_hours(self, message: str, business_data: dict[str, Any]) -> KnowledgeAnswer | None:
        lowered = message.lower()
        if not any(word in lowered for word in ("hour", "timing", "open", "close", "eppo", "neram")):
            return None
        timings = business_data.get("timings") or {}
        if not isinstance(timings, dict) or not timings:
            return None
        chunks: list[str] = []
        for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
            timing = timings.get(day)
            if not isinstance(timing, dict):
                continue
            if timing.get("is_closed"):
                chunks.append(f"{day.title()} closed")
            else:
                chunks.append(f"{day.title()} {timing.get('open', '09:00')} to {timing.get('close', '18:00')}")
        if not chunks:
            return None
        return KnowledgeAnswer(text=". ".join(chunks[:7]), source="hours", confidence=0.88)

    def _answer_services(self, message: str, business_data: dict[str, Any]) -> KnowledgeAnswer | None:
        lowered = message.lower()
        if not any(word in lowered for word in ("service", "product", "price", "cost", "offer", "sell")):
            return None
        products = business_data.get("products_services") or []
        if not isinstance(products, list) or not products:
            return None
        names: list[str] = []
        for item in products[:5]:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            price = item.get("price")
            names.append(f"{item['name']} for {price}" if price not in {None, ""} else str(item["name"]))
        if not names:
            return None
        suffix = " and more" if len(products) > 5 else ""
        return KnowledgeAnswer(
            text=f"We have {', '.join(names)}{suffix}. Which one would you like to know about?",
            source="service_list",
            confidence=0.78,
        )

    @staticmethod
    def _voice_clean(text: str) -> str:
        text = re.sub(r"\*\*(.*?)\*\*", r"\1", text or "")
        text = re.sub(r"[_`#>*-]+", " ", text)
        text = re.sub(r"\s+", " ", text.replace("\n", ". ")).strip()
        return text


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z0-9]+", value.lower()) if len(token) > 2}


def _overlap(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left), len(right))
