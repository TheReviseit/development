"""Policies for latency, tenant isolation, and PII handling."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class LatencyBudgetPolicy:
    deterministic_p50_ms: int = 650
    deterministic_p90_ms: int = 900
    llm_first_token_budget_ms: int = 900

    def should_avoid_llm(self, source: str | None) -> bool:
        return source in {"greeting", "local_trivial", "domain_answerer", "faq_match"}


class TenantIsolationPolicy:
    prefix = "agents"

    @classmethod
    def safe_segment(cls, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_.-]", "_", value)[:160]

    @classmethod
    def redis_key(cls, tenant_id: str, *parts: str) -> str:
        safe_parts = [cls.safe_segment(tenant_id), *[cls.safe_segment(part) for part in parts]]
        return ":".join([cls.prefix, *safe_parts])


class PIIRedactionPolicy:
    phone_pattern = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)")

    @classmethod
    def redact_phone(cls, value: str | None) -> str | None:
        if not value:
            return value
        digits = re.sub(r"\D", "", value)
        if len(digits) <= 4:
            return "***"
        return f"***{digits[-4:]}"

    @classmethod
    def redact_text(cls, value: str) -> str:
        return cls.phone_pattern.sub(lambda match: cls.redact_phone(match.group(0)) or "***", value)

