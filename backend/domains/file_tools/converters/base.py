"""Converter abstraction for future file tools."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

InputT = TypeVar("InputT")


@dataclass(frozen=True)
class ConversionResult:
    bytes: bytes
    mime_type: str
    extension: str
    page_count: int


class Converter(ABC, Generic[InputT]):
    tool_key: str

    @abstractmethod
    def convert(self, request: InputT) -> ConversionResult:
        """Convert a validated request into an artifact."""
