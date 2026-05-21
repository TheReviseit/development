"""Knowledge contracts for FAQ and business-data responses."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class KnowledgeAnswer:
    text: str
    source: str
    confidence: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

